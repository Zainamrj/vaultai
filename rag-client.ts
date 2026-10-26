// Browser-side RAG helpers: embed chunks, retrieve, stream an answer, judge it.
// Everything here talks to our own /api routes. Raw questions are redacted first.
import { redact } from "./redact";
import type { Chunk, JudgeResponse, Wire } from "@/types";

export type StoredChunk = Chunk & { vector: number[]; docName?: string };

export type AnswerResult = {
  text: string;        // full answer, trimmed
  citations: number[]; // numbers cited as [1], [2] ... (placeholders like [SSN_1] are NOT citations)
  wire: Wire;          // what was sent to the model, for the Wire Inspector
};

const EMBED_BATCH = 32;

/** Redacts a typed question so personal data never leaves the browser unredacted. */
export function redactQuestion(q: string): string {
  return redact(q).redactedText;
}

export function cosine(a: number[], b: number[]): number {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return na && nb ? dot / (Math.sqrt(na) * Math.sqrt(nb)) : 0;
}

export function topK(queryVec: number[], store: StoredChunk[], k = 4): { chunk: StoredChunk; score: number }[] {
  return store
    .map((chunk) => ({ chunk, score: cosine(queryVec, chunk.vector) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, k);
}

/** Only [1], [2] style numbers are citations. [PERSON_1] and [SSN_1] are redaction placeholders. */
export function parseCitations(text: string): number[] {
  const found = new Set<number>();
  for (const m of text.matchAll(/\[(\d{1,2})\]/g)) found.add(Number(m[1]));
  return [...found].sort((a, b) => a - b);
}

async function postJson<T>(url: string, body: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  } catch {
    throw new Error("Could not reach the server. Check your connection and try again.");
  }
  if (!res.ok) throw new Error(`The server returned an error (${res.status}).`);
  return (await res.json()) as T;
}

export async function embedTexts(texts: string[]): Promise<{ vectors: number[][]; wires: Wire[] }> {
  const vectors: number[][] = [];
  const wires: Wire[] = [];
  for (let i = 0; i < texts.length; i += EMBED_BATCH) {
    const r = await postJson<{ vectors: number[][]; wire: Wire }>("/api/embed", { texts: texts.slice(i, i + EMBED_BATCH) });
    vectors.push(...r.vectors);
    wires.push(r.wire);
  }
  return { vectors, wires };
}

/** Call this when a document is approved. Returns the chunks with vectors attached. */
export async function embedChunks(chunks: Chunk[], docName?: string): Promise<{ stored: StoredChunk[]; wires: Wire[] }> {
  const { vectors, wires } = await embedTexts(chunks.map((c) => c.text));
  return { stored: chunks.map((c, i) => ({ ...c, vector: vectors[i], docName })), wires };
}

/** Finds the k most relevant chunks. The question is redacted before it is embedded. */
export async function retrieve(question: string, store: StoredChunk[], k = 4) {
  if (store.length === 0) return { question: redactQuestion(question), hits: [], wire: undefined as Wire | undefined };
  const safe = redactQuestion(question);
  const { vectors, wires } = await embedTexts([safe]);
  return { question: safe, hits: topK(vectors[0], store, k), wire: wires[0] };
}

/** Streams the answer. onToken is called with each piece of text as it arrives. */
export async function streamAnswer(
  question: string,
  chunks: { text: string }[],
  onToken: (piece: string, soFar: string) => void,
  signal?: AbortSignal,
): Promise<AnswerResult> {
  const safe = redactQuestion(question);
  const t0 = Date.now();
  let res: Response;
  try {
    res = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question: safe, chunks: chunks.map((c) => ({ text: c.text })) }),
      signal,
    });
  } catch (e) {
    if ((e as Error).name === "AbortError") throw e;
    throw new Error("Could not reach the server. Check your connection and try again.");
  }
  if (!res.ok || !res.body) throw new Error(`The server returned an error (${res.status}).`);

  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let text = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    const piece = dec.decode(value, { stream: true });
    text += piece;
    onToken(piece, text);
  }
  text = text.trim();
  return {
    text,
    citations: parseCitations(text),
    wire: {
      model: res.headers.get("X-Wire-Model") ?? "unknown",
      payload: { question: safe, context: chunks.map((c) => c.text) }, // exactly what the server forwards to the model
      latencyMs: Date.now() - t0,
    },
  };
}

/** Asks Nemotron Ultra to check the answer against the same chunks. */
export function judgeAnswer(question: string, answer: string, chunks: { text: string }[]): Promise<JudgeResponse> {
  return postJson<JudgeResponse>("/api/judge", {
    question: redactQuestion(question),
    answer,
    chunks: chunks.map((c) => ({ text: c.text })),
  });
}
