// VaultAI evaluation: runs docs/eval/questions.json through the whole pipeline with the REAL models
// (redact -> chunk -> embed -> retrieve -> answer with Super -> judge) and writes docs/eval/results.md.
// Run:   node --env-file=.env.local scripts/eval.mjs
// Cheap: JUDGE_MODEL=fast node --env-file=.env.local scripts/eval.mjs     (judge = Nano)
// Standalone: no Next.js imports, driven by env vars, so it also runs as a container / Nebius Serverless Job.
//   EVAL_OUT=<path>   where to write the results table (default docs/eval/results.md)
// Needs Node 22.18+ (it loads the TypeScript files in lib/ directly).
// Rules: every string in mustContain must appear (case-insensitive, commas ignored);
//        no string in mustNotContain may appear.
import OpenAI from "openai";
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { redact } from "../lib/redact.ts";
import { chunk } from "../lib/chunk.ts";
import { chatMessages, judgeMessages, extractJson } from "../lib/prompts.ts";
import { fileURLToPath } from "node:url";

const need = ["NEBIUS_API_KEY", "NEBIUS_BASE_URL", "MODEL_FAST", "MODEL_MAIN", "MODEL_JUDGE", "MODEL_EMBED"];
const missing = need.filter((k) => !process.env[k]);
if (missing.length) { console.error("Missing env vars:", missing.join(", ")); process.exit(1); }

const client = new OpenAI({ baseURL: process.env.NEBIUS_BASE_URL, apiKey: process.env.NEBIUS_API_KEY });
const M = { fast: process.env.MODEL_FAST, main: process.env.MODEL_MAIN, judge: process.env.MODEL_JUDGE, embed: process.env.MODEL_EMBED };
const judgeModel = process.env.JUDGE_MODEL === "fast" ? M.fast : M.judge;
const DIMS = 512, TOP_K = 4;

const PRICE = [[/nano/i, [0.06, 0.24]], [/super/i, [0.30, 0.90]], [/ultra/i, [1.00, 3.00]]];
let totalCost = 0;
const cost = (model, u) => {
  if (!u) return 0;
  const p = PRICE.find(([re]) => re.test(model))?.[1] ?? [0, 0];
  const c = (u.prompt_tokens * p[0] + u.completion_tokens * p[1]) / 1e6; totalCost += c; return c;
};
const cosine = (a, b) => { let d = 0, x = 0, y = 0; for (let i = 0; i < a.length; i++) { d += a[i] * b[i]; x += a[i] ** 2; y += b[i] ** 2; } return d / (Math.sqrt(x) * Math.sqrt(y)); };
const norm = (s) =>
  s.toLowerCase()
    .replace(/[\u00a0\u2007\u2009\u202f]/g, " ")   // non-breaking / thin spaces
    .replace(/[\u2010-\u2015\u2212]/g, "-")         // fancy hyphens and dashes
    .replace(/,/g, "")
    .replace(/\s+/g, " ");

// Prompts come from lib/prompts.ts, the same module the API routes use, so the eval measures the real app.

// ---------- load, redact, chunk, embed ----------
const dir = new URL("../docs/test-data/", import.meta.url);
const questions = JSON.parse(readFileSync(new URL("../docs/eval/questions.json", import.meta.url), "utf8"));
const wanted = new Set(questions.map((q) => q.doc).filter((d) => d !== "all"));
const files = readdirSync(dir).filter((f) => f.endsWith(".txt") && wanted.has(f));
const unknownDocs = [...wanted].filter((d) => !files.includes(d));
if (unknownDocs.length) console.warn("WARNING: questions refer to files not found in docs/test-data:", unknownDocs.join(", "));

const chunks = [];
for (const f of files) {
  const { redactedText } = redact(readFileSync(new URL(f, dir), "utf8"));
  chunk(redactedText).forEach((t, i) => chunks.push({ file: f, id: `${f}#${i + 1}`, text: t }));
}
const emb = await client.embeddings.create({ model: M.embed, input: chunks.map((c) => c.text), dimensions: DIMS });
chunks.forEach((c, i) => (c.vector = emb.data[i].embedding));
console.log(`Loaded ${files.length} documents, ${chunks.length} chunks. Answer model: ${M.main}. Judge model: ${judgeModel}\n`);

// ---------- run questions ----------
const flagged = (v, sc) => v !== "verified" || (typeof sc === "number" && sc <= 3);

/** One judge call with the shared prompt. Returns the parsed verdict plus timing. */
async function runJudge(safeQ, answer, top) {
  const t = Date.now();
  const j = await client.chat.completions.create({
    model: judgeModel, temperature: 0, max_tokens: 2000,
    messages: judgeMessages(safeQ, answer, top.map((x) => ({ text: x.c.text }))),
  });
  cost(judgeModel, j.usage);
  const ms = Date.now() - t;
  const raw = j.choices[0].message.content ?? "";
  try {
    const js = extractJson(raw);
    return { verdict: js.verdict, score: js.score, claims: js.claims ?? [], ms };
  } catch {
    console.log(`      judge output could not be parsed (finish_reason: ${j.choices[0].finish_reason}, ${j.usage?.completion_tokens} tokens): ${raw.replace(/\s+/g, " ").slice(0, 300) || "(empty)"}`);
    return { verdict: "invalid-json", score: "-", claims: [], ms };
  }
}

const rows = [];
const topByQuestion = new Map();
for (const q of questions) {
  const t0 = Date.now();
  const safeQ = redact(q.question).redactedText;
  const tA = Date.now();
  const qv = (await client.embeddings.create({ model: M.embed, input: [safeQ], dimensions: DIMS })).data[0].embedding;
  const top = chunks.map((c) => ({ c, s: cosine(qv, c.vector) })).sort((a, b) => b.s - a.s).slice(0, TOP_K);
  topByQuestion.set(q.id, { safeQ, top });
  const retrievalOk = q.doc === "all" ? true : top.some((x) => x.c.file === q.doc);
  const top1Ok = q.doc === "all" ? true : top[0].c.file === q.doc;
  const embedMs = Date.now() - tA;
  const tB = Date.now();

  const a = await client.chat.completions.create({
    model: M.main, temperature: 0.1, max_tokens: 1500,
    messages: chatMessages(safeQ, top.map((x) => ({ text: x.c.text }))),
  });
  const answer = (a.choices[0].message.content ?? "").trim();
  cost(M.main, a.usage);
  const answerMs = Date.now() - tB;
  const outTokens = a.usage?.completion_tokens ?? 0;

  const { verdict, score, ms: judgeMs } = await runJudge(safeQ, answer, top);

  const ans = norm(answer);
  const missingStrings = (q.mustContain ?? []).filter((s) => !ans.includes(norm(s)));
  const forbidden = (q.mustNotContain ?? []).filter((s) => ans.includes(norm(s)));
  const pass = answer.length > 0 && missingStrings.length === 0 && forbidden.length === 0;
  rows.push({ id: q.id, type: q.type, question: q.question, answer, pass, missingStrings, forbidden, retrievalOk, top1Ok, verdict, score, embedMs, answerMs, judgeMs, outTokens, ms: Date.now() - t0 });
  console.log(`${pass ? "PASS" : "FAIL"}  ${q.id} (${q.type})  top1:${top1Ok ? "ok" : "MISS"} top${TOP_K}:${retrievalOk ? "ok" : "MISS"}  judge:${verdict}/${score}  | embed ${embedMs} ms, answer ${answerMs} ms (${outTokens} out tokens), judge ${judgeMs} ms`);
  if (!pass) console.log(`      answer: ${answer.replace(/\s+/g, " ").slice(0, 200)}\n      missing: ${JSON.stringify(missingStrings)}  forbidden found: ${JSON.stringify(forbidden)}`);
}

// ---------- judge check: deliberately wrong answers must be flagged ----------
// docs/eval/planted-wrong.json holds answers that contradict the documents. The judge should NOT call them verified.
const planted = [];
let plantedList = [];
try { plantedList = JSON.parse(readFileSync(new URL("../docs/eval/planted-wrong.json", import.meta.url), "utf8")); } catch { console.warn("No docs/eval/planted-wrong.json: skipping the planted-wrong judge check."); }
for (const p of plantedList) {
  const ctx = topByQuestion.get(p.questionId);
  if (!ctx) { console.warn(`planted ${p.id}: unknown questionId ${p.questionId}, skipped`); continue; }
  const r = await runJudge(ctx.safeQ, p.wrongAnswer, ctx.top);
  const ok = flagged(r.verdict, r.score);
  planted.push({ id: p.id, questionId: p.questionId, answer: p.wrongAnswer, verdict: r.verdict, score: r.score, unsupported: r.claims.filter((c) => c.supported === false).length, ok, ms: r.ms });
  console.log(`${ok ? "FLAGGED " : "MISSED  "} ${p.id} (planted wrong answer to ${p.questionId})  judge:${r.verdict}/${r.score}  | judge ${r.ms} ms`);
}

// ---------- summary + results.md ----------
const passed = rows.filter((r) => r.pass).length;
const byType = {};
for (const r of rows) { (byType[r.type] ??= { n: 0, ok: 0 }).n++; if (r.pass) byType[r.type].ok++; }
const avg = (k) => Math.round(rows.reduce((s, r) => s + r[k], 0) / rows.length);
const avgMs = avg("ms");
const answerable = rows.filter((r) => r.type === "answerable");
const top1 = answerable.filter((r) => r.top1Ok).length;
const inTopK = answerable.filter((r) => r.retrievalOk).length;
// correct answers the judge should accept: answerable questions that passed the string checks
const goodAnswers = rows.filter((r) => r.type === "answerable" && r.pass);
const goodVerified = goodAnswers.filter((r) => r.verdict === "verified").length;
const plantedFlagged = planted.filter((p) => p.ok).length;
const esc = (s) => String(s).replace(/\|/g, "\\|").replace(/\s+/g, " ");
const md = [
  `# Evaluation results`, ``,
  `Run: ${new Date().toISOString().slice(0, 10)} | Answer model: \`${M.main}\` | Judge: \`${judgeModel}\` | Embeddings: \`${M.embed}\` (${DIMS} dims) | Top-k: ${TOP_K}`, ``,
  `**${passed}/${rows.length} questions passed.** Retrieval on answerable questions: right document first for ${top1}/${answerable.length}, within the top ${TOP_K} for ${inTopK}/${answerable.length}. Estimated cost of the whole run: about $${totalCost.toFixed(4)}.`, ``,
  ...(planted.length
    ? [`**Judge check:** ${plantedFlagged}/${planted.length} deliberately wrong answers were flagged (not marked verified); ${goodVerified}/${goodAnswers.length} correct answers were marked verified.`, ``]
    : []),
  `Average time per question: ${avgMs} ms in total (embed ${avg("embedMs")} ms, answer ${avg("answerMs")} ms, judge ${avg("judgeMs")} ms).`, ``,
  `| Type | Passed |`, `|---|---|`,
  ...Object.entries(byType).map(([t, v]) => `| ${t} | ${v.ok}/${v.n} |`), ``,
  `| ID | Type | Result | Top-1 doc | In top-${TOP_K} | Judge | Answer (ms) | Judge (ms) | Answer |`, `|---|---|---|---|---|---|---|---|---|`,
  ...rows.map((r) => `| ${r.id} | ${r.type} | ${r.pass ? "pass" : "FAIL"} | ${r.top1Ok ? "yes" : "no"} | ${r.retrievalOk ? "yes" : "no"} | ${r.verdict} (${r.score}) | ${r.answerMs} | ${r.judgeMs} | ${esc(r.answer).slice(0, 140)} |`), ``,
  ...(planted.length
    ? [`Planted wrong answers (judge should not say "verified"):`, ``, `| ID | For | Judge | Unsupported claims | Result | Planted answer |`, `|---|---|---|---|---|---|`,
       ...planted.map((p) => `| ${p.id} | ${p.questionId} | ${p.verdict} (${p.score}) | ${p.unsupported} | ${p.ok ? "flagged" : "MISSED"} | ${esc(p.answer)} |`), ``]
    : []),
  `Checks: every \`mustContain\` string must appear in the answer; no \`mustNotContain\` string may appear. Documents and questions are synthetic.`,
  `Method notes: retrieval here is vector top-${TOP_K} only; the app also fuses BM25 keyword search and sends every chunk when the collection is small, so app retrieval is at least as good. Prompts are shared with the app (lib/prompts.ts). Judge results are one run at temperature 0; they will vary between runs and models.`, ``,
].join("\n");

const outPath = process.env.EVAL_OUT ? process.env.EVAL_OUT : fileURLToPath(new URL("../docs/eval/results.md", import.meta.url));
writeFileSync(outPath, md);
// Also print the table: when this runs as a container job, the logs are the only output that survives.
console.log(`\n----- results.md -----\n${md}\n----- end results.md -----`);
console.log(`\n${passed}/${rows.length} passed. Retrieval (answerable only): top-1 ${top1}/${answerable.length}, top-${TOP_K} ${inTopK}/${answerable.length}. Judge flagged ${plantedFlagged}/${planted.length} planted wrong answers. Avg per question: ${avgMs} ms (embed ${avg("embedMs")}, answer ${avg("answerMs")}, judge ${avg("judgeMs")}). Estimated cost ~$${totalCost.toFixed(4)}. Wrote ${outPath}`);
process.exit(passed === rows.length ? 0 : 1);
