// Offline unit tests (no API key, no network). Run: npm test
// Needs Node 22.18+ (loads the TypeScript files in lib/ directly).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { appendAudit, verifyAudit, auditHead, buildPurgeReceipt, sha256, GENESIS } from "../lib/audit.ts";
import { chatMessages, judgeMessages, extractJson, normalizeCitations, STRICT_SUFFIX, CHAT_SYSTEM } from "../lib/prompts.ts";
import { chunk } from "../lib/chunk.ts";
import { redact } from "../lib/redact.ts";

const dataDir = new URL("../docs/test-data/", import.meta.url);

// ---------- audit log ----------
async function sampleLog() {
  let log = [];
  log = await appendAudit(log, { ts: 1, action: "ingest", docIds: ["doc_a"] });
  log = await appendAudit(log, { ts: 2, action: "ask", docIds: ["doc_a"], model: "super", tokens: 120, latencyMs: 900 });
  log = await appendAudit(log, { ts: 3, action: "judge", docIds: ["doc_a"], model: "ultra", latencyMs: 1700 });
  return log;
}

test("audit: entries chain from GENESIS and verify", async () => {
  const log = await sampleLog();
  assert.equal(log[0].prevHash, GENESIS);
  assert.equal(log[1].prevHash, log[0].hash);
  assert.equal(log[2].prevHash, log[1].hash);
  assert.deepEqual(await verifyAudit(log), { ok: true });
  assert.deepEqual(await verifyAudit([]), { ok: true });
});

test("audit: appendAudit does not mutate the input log", async () => {
  const log = await sampleLog();
  const before = JSON.stringify(log);
  await appendAudit(log, { ts: 4, action: "ask", docIds: ["doc_a"] });
  assert.equal(JSON.stringify(log), before);
});

test("audit: editing an entry is detected", async () => {
  const log = await sampleLog();
  const tampered = structuredClone(log);
  tampered[1].tokens = 1;
  assert.deepEqual(await verifyAudit(tampered), { ok: false, brokenAt: 1 });
});

test("audit: removing or reordering entries is detected", async () => {
  const log = await sampleLog();
  assert.equal((await verifyAudit([log[0], log[2]])).ok, false);
  assert.equal((await verifyAudit([log[1], log[0], log[2]])).ok, false);
});

test("audit: survives a JSON round trip (localStorage / IndexedDB)", async () => {
  const log = await sampleLog();
  assert.deepEqual(await verifyAudit(JSON.parse(JSON.stringify(log))), { ok: true });
});

test("purge receipt: hash of ids, counts, audit head", async () => {
  const log = await sampleLog();
  const r = await buildPurgeReceipt(["doc_a", "doc_b"], 7, log);
  assert.equal(r.chunkCount, 7);
  assert.deepEqual(r.docIds, ["doc_a", "doc_b"]);
  assert.equal(r.idsHash, await sha256("doc_a,doc_b"));
  assert.equal(r.auditHead, auditHead(log));
  assert.ok(!Number.isNaN(Date.parse(r.purgedAt)));
});

// ---------- prompts ----------
test("prompts: chat messages number the context and carry the question", () => {
  const m = chatMessages("What dose?", [{ text: "alpha" }, { text: "beta" }]);
  assert.equal(m[0].role, "system");
  assert.equal(m[0].content, CHAT_SYSTEM);
  assert.match(m[1].content, /\[1\] alpha\n\n\[2\] beta/);
  assert.match(m[1].content, /QUESTION: What dose\?$/);
});

test("prompts: strict mode only appends the suffix", () => {
  const strict = chatMessages("q", [{ text: "x" }], true);
  assert.equal(strict[0].content, CHAT_SYSTEM + STRICT_SUFFIX);
});

test("prompts: judge messages include question, answer and numbered sources", () => {
  const m = judgeMessages("q?", "a.", [{ text: "src" }]);
  assert.match(m[1].content, /QUESTION: q\?/);
  assert.match(m[1].content, /ANSWER: a\./);
  assert.match(m[1].content, /SOURCES:\n\[1\] src/);
});

test("extractJson: plain, fenced, and reasoning text around the JSON", () => {
  const obj = { claims: [], score: 5, verdict: "verified" };
  const s = JSON.stringify(obj);
  assert.deepEqual(extractJson(s), obj);
  assert.deepEqual(extractJson("```json\n" + s + "\n```"), obj);
  assert.deepEqual(extractJson("Let me think about this...\n" + s + "\nHope that helps."), obj);
  assert.throws(() => extractJson("no json here"));
});

// ---------- chunking ----------
test("chunk: PDF-style text (no blank lines) is split, not returned as one giant chunk", () => {
  const line = "The patient [PERSON_1] attended on [DATE_1] and reported fatigue. HbA1c was 8.4 percent. ";
  const text = Array.from({ length: 60 }, () => line).join("\n");
  const out = chunk(text);
  assert.ok(out.length > 4, `expected several chunks, got ${out.length}`);
  for (const c of out) assert.ok(c.length <= 900 + 150 + 2, `chunk too long: ${c.length}`);
});

test("chunk: a long run with no break points is hard-cut at spaces, never inside a placeholder", () => {
  const text = Array.from({ length: 400 }, (_, i) => `word${i} [SSN_${i % 5}]`).join(" ");
  const out = chunk(text);
  assert.ok(out.length > 1);
  for (const c of out) {
    assert.ok(!/\[[A-Z_]*$/.test(c), `chunk ends inside a placeholder: ...${c.slice(-12)}`);
    assert.ok(!/^[A-Z_0-9]*\]/.test(c), `chunk starts inside a placeholder: ${c.slice(0, 12)}...`);
  }
});

test("chunk: nothing is lost (every word appears in some chunk)", () => {
  const text = Array.from({ length: 200 }, (_, i) => `Sentence number ${i} says something useful.`).join(" ");
  const joined = chunk(text).join(" ");
  for (let i = 0; i < 200; i++) assert.ok(joined.includes(`number ${i} `), `lost sentence ${i}`);
});

test("chunk: short documents stay whole", () => {
  assert.deepEqual(chunk("One short paragraph."), ["One short paragraph."]);
  assert.deepEqual(chunk(""), []);
});

// ---------- redaction regressions ----------
test("redact: no known synthetic identifier survives in any test document", () => {
  const secrets = [
    "GFD-6341-6351",                // Insurance Member ID (was leaking from a stale lib/redact.ts)
    "GB29 NWBK 6016 1331 9268 19",  // spaced IBAN (was leaking)
    "876-09-4365",                  // SSN
    "flora.vero98@example.com",
    "07758358295",
    "SA0380000000608010167519",
  ];
  for (const f of readdirSync(dataDir).filter((f) => f.endsWith(".txt"))) {
    const { redactedText } = redact(readFileSync(new URL(f, dataDir), "utf8"));
    for (const s of secrets) assert.ok(!redactedText.includes(s), `${f} leaks ${s}`);
  }
});

test("redact: the same value always maps to the same placeholder", () => {
  const { redactedText } = redact("Patient: Anna Lee called. Later, Dr. Lee met Anna again. SSN 123-45-6789 and 123-45-6789.");
  assert.equal((redactedText.match(/\[SSN_1\]/g) ?? []).length, 2);
  assert.ok(!redactedText.includes("Anna"));
});

test("normalizeCitations: fullwidth brackets become [n]; placeholders untouched", () => {
  assert.equal(normalizeCitations("dose is 1000 mg【1】【3】 and ［2］ [SSN_1]"), "dose is 1000 mg[1][3] and [2] [SSN_1]");
});

test("normalizeCitations: handles 【3†L1-L2】 style", () => {
  assert.equal(normalizeCitations("rise to 1000 mg【3†L1-L2】."), "rise to 1000 mg[3].");
});
