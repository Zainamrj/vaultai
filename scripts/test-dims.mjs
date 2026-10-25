import OpenAI from "openai";
const c = new OpenAI({ baseURL: process.env.NEBIUS_BASE_URL, apiKey: process.env.NEBIUS_API_KEY });
try {
  const e = await c.embeddings.create({
    model: process.env.MODEL_EMBED,
    input: ["hello"],
    dimensions: 512,
  });
  console.log("dimensions param works, length:", e.data[0].embedding.length);
} catch (err) {
  console.log("dimensions not supported:", err.status, err.message);
}