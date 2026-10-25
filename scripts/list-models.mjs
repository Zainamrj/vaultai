import OpenAI from "openai";
const c = new OpenAI({ baseURL: process.env.NEBIUS_BASE_URL, apiKey: process.env.NEBIUS_API_KEY });
for await (const m of await c.models.list()) console.log(m.id);