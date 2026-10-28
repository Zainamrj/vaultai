// API smoke test for the backend routes. Needs a running server in MOCK mode (no API key, no cost).
//
//   1) terminal A:  MOCK_AI=true npm run dev          (or: MOCK_AI=true npm run build && MOCK_AI=true npm start)
//   2) terminal B:  npm run smoke                      (BASE_URL=http://localhost:3000 by default)
//
// Refuses to run against a server that is not in mock mode, so it can never spend model credits.
// Section "Frontend" is informational: it reports on pages owned by the UI side and never fails the run.
import { readFileSync } from "node:fs";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const J = { "content-type": "application/json" };
const post = (path, body) => fetch(BASE + path, { method: "POST", headers: J, body: JSON.stringify(body) });
const SRC = [{ text: "Metformin 1000 mg twice daily. Amlodipine 5 mg once daily." }];

let failed = 0;
const results = [];
async function check(name, fn) {
  try {
    await fn();
    results.push(`  PASS  ${name}`);
  } catch (e) {
    failed++;
    results.push(`  FAIL  ${name}\n          ${e.message}`);
  }
}
const eq = (a, b, msg) => { if (a !== b) throw new Error(`${msg ?? "expected"}: got ${JSON.stringify(a)}, wanted ${JSON.stringify(b)}`); };
const ok = (v, msg) => { if (!v) throw new Error(msg); };

// ---- safety: mock mode only ----
// /api/status is prerendered at build time, so it can be wrong. Probe a live route instead:
// in mock mode /api/rewrite answers locally with wire.model "mock" and calls no model.
let probe;
try {
  const r = await post("/api/rewrite", { question: "mock probe" });
  probe = r.ok ? await r.json() : null;
} catch { console.error(`Cannot reach ${BASE}. Start the server first (see the header of this file).`); process.exit(2); }
if (probe?.wire?.model !== "mock") {
  console.error("Server is NOT in mock mode (start it with MOCK_AI=true). Refusing to run so no credits are spent.");
  process.exit(2);
}

const SECRETS = ["GFD-6341-6351", "876-09-4365", "flora.vero98@example.com", "07758358295", "Flora"];

await check("ingest: sample document is redacted (no identifiers survive)", async () => {
  const text = readFileSync(new URL("../public/samples/clinic_visit_summary.txt", import.meta.url), "utf8");
  const form = new FormData();
  form.append("file", new File([text], "clinic_visit_summary.txt", { type: "text/plain" }));
  const r = await fetch(BASE + "/api/ingest", { method: "POST", body: form });
  eq(r.status, 200, "status");
  const d = await r.json();
  ok(d.entities.length > 0 && d.chunks.length > 0, "no entities or chunks returned");
  for (const s of SECRETS) ok(!d.redactedText.includes(s), `redactedText leaks ${s}`);
});
await check("ingest: oversized file -> 413", async () => {
  const form = new FormData();
  form.append("file", new File(["a".repeat(4.3 * 1024 * 1024)], "big.txt", { type: "text/plain" }));
  eq((await fetch(BASE + "/api/ingest", { method: "POST", body: form })).status, 413);
});
await check("ingest: no file -> 400", async () => {
  const form = new FormData(); form.append("x", "1");
  eq((await fetch(BASE + "/api/ingest", { method: "POST", body: form })).status, 400);
});

await check("embed: returns 512-dim vectors and a wire record", async () => {
  const r = await post("/api/embed", { texts: ["hello", "metformin dose"] });
  eq(r.status, 200, "status");
  const d = await r.json();
  eq(d.vectors.length, 2, "vector count"); eq(d.vectors[0].length, 512, "dims");
  ok(typeof d.wire.latencyMs === "number" && d.wire.model, "wire missing model/latency");
});
await check("embed: invalid input -> 400 (empty, too many, too long, not JSON)", async () => {
  eq((await post("/api/embed", {})).status, 400, "empty body");
  eq((await post("/api/embed", { texts: [] })).status, 400, "no texts");
  eq((await post("/api/embed", { texts: Array(65).fill("a") })).status, 400, "65 texts");
  eq((await post("/api/embed", { texts: ["x".repeat(6001)] })).status, 400, "6001 chars");
  eq((await fetch(BASE + "/api/embed", { method: "POST", headers: J, body: "nope" })).status, 400, "not JSON");
});

await check("chat: streams an answer and sets X-Wire-Model", async () => {
  const r = await post("/api/chat", { question: "What dose?", chunks: SRC });
  eq(r.status, 200, "status");
  ok(r.headers.get("x-wire-model"), "missing X-Wire-Model header");
  ok((await r.text()).trim().length > 0, "empty stream");
});
await check("chat: invalid input -> 400 (no chunks, 9 chunks)", async () => {
  eq((await post("/api/chat", { question: "q", chunks: [] })).status, 400, "no chunks");
  eq((await post("/api/chat", { question: "q", chunks: Array(9).fill({ text: "a" }) })).status, 400, "9 chunks");
});

await check("judge: valid verdict; wire payload holds the exact messages sent", async () => {
  const d = await (await post("/api/judge", { question: "dose?", answer: "Metformin is 1000 mg [1].", chunks: SRC })).json();
  ok(["verified", "partial", "unverified"].includes(d.verdict), "bad verdict");
  ok(d.score >= 1 && d.score <= 5, "score out of range");
  eq(d.wire.payload.messages.length, 2, "payload.messages length");
  eq(d.wire.payload.messages[0].role, "system", "first message role");
  ok(d.wire.payload.messages[1].content.includes("SOURCES:"), "payload is not the real judge prompt");
});
await check("judge: a planted wrong answer is flagged (mock marker PLANTED_WRONG)", async () => {
  const d = await (await post("/api/judge", { question: "dose?", answer: "PLANTED_WRONG metformin is 9000 mg.", chunks: SRC })).json();
  eq(d.verdict, "unverified", "verdict"); eq(d.score, 1, "score");
  ok(d.claims.some((c) => c.supported === false), "no unsupported claim reported");
  ok(d.regenerated === undefined, "regenerated without being asked");
});
await check("judge: regenerate:true replaces a low-scoring answer with a better one", async () => {
  const d = await (await post("/api/judge", { question: "dose?", answer: "PLANTED_WRONG metformin is 9000 mg.", chunks: SRC, regenerate: true })).json();
  eq(d.regenerated, true, "regenerated"); ok(d.revisedAnswer, "no revisedAnswer");
  ok(d.score > d.firstAttempt.score, "revised score not better than first");
  ok(d.regenWire?.model, "no regenWire");
});
await check("judge: invalid input -> 400", async () => {
  eq((await post("/api/judge", { question: "q", chunks: SRC })).status, 400, "missing answer");
});

await check("rewrite: returns a query and a wire record", async () => {
  const d = await (await post("/api/rewrite", { question: "What is the dose of metformin?" })).json();
  ok(typeof d.query === "string" && d.query.length > 0, "no query"); ok(d.wire.model, "no wire");
  eq((await post("/api/rewrite", { question: "" })).status, 400, "empty question");
});

console.log(`\nBackend smoke test against ${BASE} (mock mode)\n${results.join("\n")}\n`);

// ---- informational: pages owned by the UI side ----
try {
  const r = await fetch(BASE + "/");
  console.log(r.status === 200 ? "  Frontend: GET / -> 200 (home page is served)" : `  Frontend: GET / -> ${r.status}  (NOT backend: the home page route is missing; see the UI feedback)`);
} catch { console.log("  Frontend: could not request /"); }

console.log(failed ? `\n${failed} backend check(s) FAILED` : "\nAll backend checks passed");
process.exit(failed ? 1 : 0);
