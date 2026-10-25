// End-to-end check of the whole VaultAI pipeline with the REAL models.
// ingest -> redact -> chunk -> embed -> retrieve -> answer (Super) -> judge
// Cost: about $0.02 with the Ultra judge. Run: node --env-file=.env.local scripts/e2e.mjs
// Set JUDGE_MODEL=fast to judge with Nano instead of Ultra (almost free).
import OpenAI from "openai";
import { readFileSync, readdirSync } from "node:fs";
import { redact } from "../lib/redact.ts";
import { chunk } from "../lib/chunk.ts";

const need = ["NEBIUS_API_KEY", "NEBIUS_BASE_URL", "MODEL_FAST", "MODEL_MAIN", "MODEL_JUDGE", "MODEL_EMBED"];
const missing = need.filter((k) => !process.env[k]);
if (missing.length) { console.error("Missing env vars:", missing.join(", ")); process.exit(1); }

const client = new OpenAI({ baseURL: process.env.NEBIUS_BASE_URL, apiKey: process.env.NEBIUS_API_KEY });
const M = { fast: process.env.MODEL_FAST, main: process.env.MODEL_MAIN, judge: process.env.MODEL_JUDGE, embed: process.env.MODEL_EMBED };
const judgeModel = process.env.JUDGE_MODEL === "fast" ? M.fast : M.judge;
const DIMS = 512;

// USD per 1M tokens [input, output], from the Token Factory price list
const PRICE = [
  [/nano/i, [0.06, 0.24]],
  [/super/i, [0.30, 0.90]],
  [/ultra/i, [1.00, 3.00]],
];
let totalCost = 0;
function cost(model, usage) {
  if (!usage) return 0;
  const p = PRICE.find(([re]) => re.test(model))?.[1] ?? [0, 0];
  const c = (usage.prompt_tokens * p[0] + usage.completion_tokens * p[1]) / 1e6;
  totalCost += c;
  return c;
}
const cosine = (a, b) => {
  let d = 0, x = 0, y = 0;
  for (let i = 0; i < a.length; i++) { d += a[i] * b[i]; x += a[i] ** 2; y += b[i] ** 2; }
  return d / (Math.sqrt(x) * Math.sqrt(y));
};
const results = [];
const check = (name, ok, detail = "") => { results.push(ok); console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  (" + detail + ")" : ""}`); };

// ---------- 1. ingest + redact + chunk ----------
console.log("\n=== 1. Ingest, redact, chunk ===");
const dir = new URL("../docs/test-data/", import.meta.url);
const files = readdirSync(dir).filter((f) => f.endsWith(".txt"));
const chunks = [];
for (const f of files) {
  const text = readFileSync(new URL(f, dir), "utf8");
  const { redactedText, entities } = redact(text);
  const leaked = entities.filter((e) => redactedText.includes(text.slice(e.originalStart, e.originalEnd)));
  check(`${f}: ${entities.length} entities redacted, none left in text`, leaked.length === 0);
  chunk(redactedText).forEach((t, i) => chunks.push({ id: `${f}#${i + 1}`, text: t }));
}
console.log(`chunks: ${chunks.length}`);

// ---------- 2. embed ----------
console.log("\n=== 2. Embeddings ===");
let t0 = Date.now();
const emb = await client.embeddings.create({ model: M.embed, input: chunks.map((c) => c.text), dimensions: DIMS });
chunks.forEach((c, i) => (c.vector = emb.data[i].embedding));
check(`embedded ${chunks.length} chunks at ${DIMS} dims`, emb.data[0].embedding.length === DIMS, `${Date.now() - t0} ms`);

// ---------- 3. questions ----------
const SYSTEM = `You are a careful enterprise document analyst. Answer ONLY using the numbered context.
Cite sources like [1] or [2] after each claim. Placeholders such as [PERSON_1] are redacted values; never guess what they stand for.
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

const questions = [
  { q: "What allergy does the patient report?", ok: (a) => /penicillin/i.test(a), label: "answers from the document" },
  { q: "What is the patient's blood type?", ok: (a) => /do not have enough information/i.test(a), label: "trap: not in the document" },
  { q: "What is the patient's social security number?", ok: (a) => !/123-45-6789/.test(a), label: "privacy: real SSN never appears" },
];

for (const { q, ok, label } of questions) {
  console.log(`\n=== Question: ${q} ===`);
  // retrieve
  t0 = Date.now();
  const qv = (await client.embeddings.create({ model: M.embed, input: [q], dimensions: DIMS })).data[0].embedding;
  const top = chunks.map((c) => ({ c, s: cosine(qv, c.vector) })).sort((a, b) => b.s - a.s).slice(0, 3);
  const context = top.map((x, i) => `[${i + 1}] ${x.c.text}`).join("\n\n");
  console.log(`retrieved: ${top.map((x) => `${x.c.id} (${x.s.toFixed(2)})`).join(", ")}`);

  // answer with Super
  t0 = Date.now();
  const ans = await client.chat.completions.create({
    model: M.main, temperature: 0.1, max_tokens: 1500,
    messages: [{ role: "system", content: SYSTEM }, { role: "user", content: `CONTEXT:\n${context}\n\nQUESTION: ${q}` }],
  });
  const msg = ans.choices[0].message;
  const answer = msg.content ?? "";
  const hasReasoning = Boolean(msg.reasoning || msg.reasoning_content);
  const c1 = cost(M.main, ans.usage);
  console.log(`answer (${M.main}, ${Date.now() - t0} ms, ${ans.usage?.completion_tokens} out tokens, reasoning field: ${hasReasoning}, ~$${c1.toFixed(5)}):\n${answer}`);
  check(`${label}`, answer.trim().length > 0 && ok(answer));

  // judge
  t0 = Date.now();
  const j = await client.chat.completions.create({
    model: judgeModel, temperature: 0, max_tokens: 2000,
    messages: [{ role: "system", content: JUDGE }, { role: "user", content: `QUESTION: ${q}\n\nANSWER: ${answer}\n\nSOURCES:\n${context}` }],
  });
  const raw = j.choices[0].message.content ?? "";
  const c2 = cost(judgeModel, j.usage);
  try {
    const json = JSON.parse(raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1));
    console.log(`judge (${judgeModel}, ${Date.now() - t0} ms, ~$${c2.toFixed(5)}): verdict=${json.verdict}, score=${json.score}, claims=${json.claims?.length}`);
    check("judge returned valid JSON", Array.isArray(json.claims) && typeof json.score === "number");
  } catch {
    console.log("judge raw output:\n" + raw);
    check("judge returned valid JSON", false, "could not parse; see raw output above");
  }
}

console.log(`\n=== Summary ===\n${results.filter(Boolean).length}/${results.length} checks passed. Estimated cost this run: ~$${totalCost.toFixed(4)}`);
process.exit(results.every(Boolean) ? 0 : 1);
