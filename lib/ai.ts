import OpenAI from "openai";

export const MOCK = process.env.MOCK_AI === "true";
export const EMBED_DIMS = 512; // must be the same for documents and queries

const client = MOCK
  ? null
  : new OpenAI({ baseURL: process.env.NEBIUS_BASE_URL!, apiKey: process.env.NEBIUS_API_KEY! });

export const MODELS = {
  fast: process.env.MODEL_FAST!,
  main: process.env.MODEL_MAIN!,
  judge: process.env.MODEL_JUDGE!,
  embed: process.env.MODEL_EMBED!,
};

type Msg = { role: "system" | "user" | "assistant"; content: string };

function hashVec(text: string, dim = EMBED_DIMS) {
  const v = new Array(dim).fill(0);
  for (const w of text.toLowerCase().match(/[a-z0-9_]+/g) ?? []) {
    let h = 0;
    for (const ch of w) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    v[h % dim] += 1;
  }
  return v;
}

export async function embed(texts: string[]): Promise<number[][]> {
  if (MOCK) return texts.map((t) => hashVec(t));
  const res = await client!.embeddings.create({
    model: MODELS.embed,
    input: texts,
    dimensions: EMBED_DIMS,
  });
  // round to 4 decimals to keep the JSON small
  return res.data.map((d) => d.embedding.map((x) => Math.round(x * 1e4) / 1e4));
}

// Reasoning models spend part of max_tokens "thinking" (the `reasoning` field).
// Only `content` is shown to the user. Keep limits generous, or answers may come back empty.
export async function* chatStream(
  messages: Msg[],
  model = MODELS.main,
  maxTokens = 1500
): AsyncGenerator<string> {
  if (MOCK) {
    for (const w of "[MOCK] This is a placeholder answer grounded in the documents [1].".split(" ")) {
      await new Promise((r) => setTimeout(r, 40));
      yield w + " ";
    }
    return;
  }
  const stream = await client!.chat.completions.create({
    model,
    messages,
    stream: true,
    temperature: 0.1,
    max_tokens: maxTokens,
  });
  for await (const part of stream) {
    const t = part.choices[0]?.delta?.content;
    if (t) yield t;
  }
}

export async function chatOnce(
  messages: Msg[],
  model = MODELS.judge,
  maxTokens = 2000
): Promise<string> {
  if (MOCK) {
    return JSON.stringify({
      claims: [
        { text: "Mock supported claim", supported: true, sourceChunkId: "1" },
        { text: "Mock unsupported claim", supported: false, note: "not found in sources" },
      ],
      score: 3,
      verdict: "partial",
    });
  }
  const res = await client!.chat.completions.create({
    model,
    messages,
    temperature: 0,
    max_tokens: maxTokens,
  });
  return res.choices[0].message.content ?? "";
}