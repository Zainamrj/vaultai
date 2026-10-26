// VaultAI evaluation: runs docs/eval/questions.json through the whole pipeline with the REAL models
// (redact -> chunk -> embed -> retrieve -> answer with Super -> judge) and writes docs/eval/results.md.
// Run:   node --env-file=.env.local scripts/eval.mjs
// Cheap: $env:JUDGE_MODEL="fast"; node --env-file=.env.local scripts/eval.mjs     (judge = Nano)
// Rules: every string in mustContain must appear (case-insensitive, commas ignored);
//        no string in mustNotContain may appear.
import OpenAI from "openai";
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { redact } from "../lib/redact.ts";
import { chunk } from "../lib/chunk.ts";

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
const norm = (s) => s.toLowerCase().replace(/,/g, "");

// Keep these two prompts identical to app/api/chat/route.ts and app/api/judge/route.ts
const SYSTEM = `You are a careful enterprise document analyst. Answer ONLY using the numbered context.
Cite sources like [1] or [2] after each claim. Placeholders such as [PERSON_1] are redacted values; never guess what they stand for.
If asked for a value that appears only as a placeholder, say the value is redacted in the documents and give the placeholder.
If the context does not contain the answer, reply exactly: "I do not have enough information."`;
const JUDGE = `You are a strict fact-checker. You receive a QUESTION, an ANSWER, and numbered SOURCES.
Rules:
1. Split the ANSWER into atomic claims. Citation markers like [1] are not claims.
2. For each claim decide whether it is directly supported by a source. Give the source number.
3. Placeholders such as [PERSON_1] or [SSN_1] are redacted values. A claim that only states a placeholder is supported if the source contains that placeholder in the right context. If the answer guesses the real value behind a placeholder, mark that claim unsupported.
4. If the ANSWER says the information is not available (for example "I do not have enough information"), return an empty claims list. Set verdict "verified" and score 5 if none of the SOURCES contain the information needed to answer the QUESTION. Set verdict "unverified" and score 1 if the SOURCES do contain it.
5. Score overall grounding from 1 to 5 (5 = every claim supported). Never use 0.
6. Return ONLY valid JSON, no prose, no code fences, in this shape:
{"claims":[{"text":"...","supported":true,"sourceChunkId":"1","note":"..."}],"score":4,"verdict":"verified|partial|unverified"}`;

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
const rows = [];
for (const q of questions) {
  const t0 = Date.now();
  const safeQ = redact(q.question).redactedText;
  const qv = (await client.embeddings.create({ model: M.embed, input: [safeQ], dimensions: DIMS })).data[0].embedding;
  const top = chunks.map((c) => ({ c, s: cosine(qv, c.vector) })).sort((a, b) => b.s - a.s).slice(0, TOP_K);
  const context = top.map((x, i) => `[${i + 1}] ${x.c.text}`).join("\n\n");
  const retrievalOk = q.doc === "all" ? true : top.some((x) => x.c.file === q.doc);

  const a = await client.chat.completions.create({
    model: M.main, temperature: 0.1, max_tokens: 1500,
    messages: [{ role: "system", content: SYSTEM }, { role: "user", content: `CONTEXT:\n${context}\n\nQUESTION: ${safeQ}` }],
  });
  const answer = (a.choices[0].message.content ?? "").trim();
  cost(M.main, a.usage);

  const j = await client.chat.completions.create({
    model: judgeModel, temperature: 0, max_tokens: 2000,
    messages: [{ role: "system", content: JUDGE }, { role: "user", content: `QUESTION: ${safeQ}\n\nANSWER: ${answer}\n\nSOURCES:\n${context}` }],
  });
  cost(judgeModel, j.usage);
  let verdict = "invalid-json", score = "-";
  try {
    const raw = j.choices[0].message.content ?? "";
    const js = JSON.parse(raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1));
    verdict = js.verdict; score = js.score;
  } catch { /* keep invalid-json */ }

  const ans = norm(answer);
  const missingStrings = (q.mustContain ?? []).filter((s) => !ans.includes(norm(s)));
  const forbidden = (q.mustNotContain ?? []).filter((s) => ans.includes(norm(s)));
  const pass = answer.length > 0 && missingStrings.length === 0 && forbidden.length === 0;
  rows.push({ id: q.id, type: q.type, question: q.question, answer, pass, missingStrings, forbidden, retrievalOk, verdict, score, ms: Date.now() - t0 });
  console.log(`${pass ? "PASS" : "FAIL"}  ${q.id} (${q.type})  retrieval:${retrievalOk ? "ok" : "MISS"}  judge:${verdict}/${score}  ${Date.now() - t0} ms`);
  if (!pass) console.log(`      answer: ${answer.replace(/\s+/g, " ").slice(0, 200)}\n      missing: ${JSON.stringify(missingStrings)}  forbidden found: ${JSON.stringify(forbidden)}`);
}

// ---------- summary + results.md ----------
const passed = rows.filter((r) => r.pass).length;
const byType = {};
for (const r of rows) { (byType[r.type] ??= { n: 0, ok: 0 }).n++; if (r.pass) byType[r.type].ok++; }
const avgMs = Math.round(rows.reduce((s, r) => s + r.ms, 0) / rows.length);
const esc = (s) => String(s).replace(/\|/g, "\\|").replace(/\s+/g, " ");
const md = [
  `# Evaluation results`, ``,
  `Run: ${new Date().toISOString().slice(0, 10)} | Answer model: \`${M.main}\` | Judge: \`${judgeModel}\` | Embeddings: \`${M.embed}\` (${DIMS} dims) | Top-k: ${TOP_K}`, ``,
  `**${passed}/${rows.length} questions passed.** Average time per question (retrieve + answer + judge): ${avgMs} ms. Estimated cost of the whole run: about $${totalCost.toFixed(4)}.`, ``,
  `| Type | Passed |`, `|---|---|`,
  ...Object.entries(byType).map(([t, v]) => `| ${t} | ${v.ok}/${v.n} |`), ``,
  `| ID | Type | Result | Right document retrieved | Judge | Time (ms) | Answer |`, `|---|---|---|---|---|---|---|`,
  ...rows.map((r) => `| ${r.id} | ${r.type} | ${r.pass ? "pass" : "FAIL"} | ${r.retrievalOk ? "yes" : "no"} | ${r.verdict} (${r.score}) | ${r.ms} | ${esc(r.answer).slice(0, 140)} |`), ``,
  `Checks: every \`mustContain\` string must appear in the answer; no \`mustNotContain\` string may appear. Documents and questions are synthetic.`, ``,
].join("\n");
writeFileSync(new URL("../docs/eval/results.md", import.meta.url), md);
console.log(`\n${passed}/${rows.length} passed. Avg ${avgMs} ms/question. Estimated cost ~$${totalCost.toFixed(4)}. Wrote docs/eval/results.md`);
process.exit(passed === rows.length ? 0 : 1);
