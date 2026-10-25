import OpenAI from "openai";

const c = new OpenAI({
  baseURL: process.env.NEBIUS_BASE_URL,
  apiKey: process.env.NEBIUS_API_KEY,
});

const model = process.env.MODEL_FAST;
console.log("model:", model);

const s = await c.chat.completions.create({
  model,
  messages: [{ role: "user", content: "Say hello in one short sentence." }],
  stream: true,
  max_tokens: 400,
});

const keys = new Set();
let text = "";
for await (const ch of s) {
  const d = ch.choices[0]?.delta ?? {};
  Object.keys(d).forEach((k) => keys.add(k));
  const t = d.content ?? "";
  text += t;
  process.stdout.write(t);
}
console.log("\nanswer length:", text.length);
console.log("delta fields seen:", [...keys]);

const e = await c.embeddings.create({
  model: process.env.MODEL_EMBED,
  input: ["hello"],
});
console.log("embedding length:", e.data[0].embedding.length);