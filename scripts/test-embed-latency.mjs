// Measures how long one embedding call takes. Costs a tiny fraction of a cent.
// Run: node --env-file=.env.local scripts/test-embed-latency.mjs
import OpenAI from "openai";
const c = new OpenAI({ baseURL: process.env.NEBIUS_BASE_URL, apiKey: process.env.NEBIUS_API_KEY });
const model = process.env.MODEL_EMBED;
console.log("embedding model:", model);
const q = "Which medication was added to improve blood pressure control?";

async function time(label, params, n = 5) {
  try {
  const ms = [];
  for (let i = 0; i < n; i++) {
    const t0 = Date.now();
    await c.embeddings.create({ model, input: [q + " " + i], ...params });   // different text each time: no caching
    ms.push(Date.now() - t0);
  }
  const avg = Math.round(ms.reduce((a, b) => a + b, 0) / n);
  console.log(`${label.padEnd(28)} ${ms.join(", ")} ms   (avg ${avg} ms)`);
  } catch (e) { console.log(`${label.padEnd(28)} failed: ${e.status ?? ""} ${e.message}`); }
}

await c.embeddings.create({ model, input: ["warm up"] });           // first call can be a cold start; not counted
await time("512 dimensions", { dimensions: 512 });
await time("default (full) dimensions", {});
await time("512 dimensions again", { dimensions: 512 });

// parallel calls: do they queue behind each other?
const t0 = Date.now();
await Promise.all([1, 2, 3, 4].map((i) => c.embeddings.create({ model, input: [q + " parallel " + i], dimensions: 512 })));
console.log(`4 calls in parallel          ${Date.now() - t0} ms total`);
