// Browser-side RAG helpers: embed chunks, retrieve, stream an answer, judge it.
// Everything here talks to our own /api routes. Raw questions are redacted first.
import { redact } from "./redact";
import { chatMessages } from "./prompts";
import type { Chunk, JudgeResponse, RewriteResponse, Wire } from "@/types";

export type StoredChunk = Chunk & { vector?: number[]; docName?: string };

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
    .filter((c) => c.vector)
    .map((chunk) => ({ chunk, score: cosine(queryVec, chunk.vector!) }))
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

// ---------- keyword ranking (BM25): instant, no network ----------
const STOP = new Set("a an and are as at be by for from has have how in is it of on or that the this to was were what when which who whom with did does do".split(" "));
const tokenize = (t: string) => (t.toLowerCase().match(/[a-z0-9]+/g) ?? []).filter((w) => w.length > 1 && !STOP.has(w));

export function bm25Rank(query: string, store: StoredChunk[]): { chunk: StoredChunk; score: number }[] {
  const docs = store.map((c) => tokenize(c.text));
  const avgLen = docs.reduce((s, d) => s + d.length, 0) / Math.max(1, docs.length);
  const df = new Map<string, number>();
  for (const d of docs) for (const w of new Set(d)) df.set(w, (df.get(w) ?? 0) + 1);
  const q = [...new Set(tokenize(query))];
  const k1 = 1.5, b = 0.75;
  return store
    .map((chunk, i) => {
      const d = docs[i];
      const tf = new Map<string, number>();
      for (const w of d) tf.set(w, (tf.get(w) ?? 0) + 1);
      let score = 0;
      for (const w of q) {
        const f = tf.get(w) ?? 0;
        if (!f) continue;
        const idf = Math.log(1 + (docs.length - (df.get(w) ?? 0) + 0.5) / ((df.get(w) ?? 0) + 0.5));
        score += (idf * f * (k1 + 1)) / (f + k1 * (1 - b + (b * d.length) / (avgLen || 1)));
      }
      return { chunk, score };
    })
    .sort((x, y) => y.score - x.score);
}

/** Nemotron Nano query cleanup. Resolves to null on any failure or timeout, so retrieval never waits on it. */
export async function rewriteQuery(safeQuestion: string, timeoutMs = 2500): Promise<RewriteResponse | null> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const res = await fetch("/api/rewrite", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question: safeQuestion }),
      signal: ctl.signal,
    });
    if (!res.ok) return null;
    const r = (await res.json()) as RewriteResponse;
    return typeof r.query === "string" && r.query.trim() ? r : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export type RetrieveMode = "all" | "hybrid" | "keyword-fallback" | "keyword";

/**
 * Finds the most relevant chunks. The question is redacted first.
 * The embedding endpoint can take anywhere from 0.5 s to 13 s, so we never wait on it for long:
 *  - small collections (<= allBelow chunks): no embedding call at all, every chunk is sent, best first.
 *  - larger collections: vector search fused with keyword search; if the embedding does not
 *    arrive within timeoutMs, we use the keyword ranking alone.
 */
export async function retrieve(
  question: string,
  store: StoredChunk[],
  k = 4,
  opts: { allBelow?: number; timeoutMs?: number; rewrite?: boolean } = {},
): Promise<{
  question: string;
  hits: { chunk: StoredChunk; score: number }[];
  wire?: Wire;
  /** Nemotron Nano query cleanup, when it ran in time. Show its wire in the Wire Inspector. */
  rewrite?: RewriteResponse;
  mode: RetrieveMode;
}> {
  const { allBelow = 6, timeoutMs = 3000, rewrite = true } = opts;
  const safe = redactQuestion(question);
  if (store.length === 0) return { question: safe, hits: [], mode: "all" };

  const lexical = bm25Rank(safe, store);
  if (store.length <= allBelow) return { question: safe, hits: lexical, mode: "all" };

  const vectorsReady = store.filter((c) => c.vector).length >= store.length / 2;
  if (!vectorsReady) return { question: safe, hits: lexical.slice(0, k), mode: "keyword" };

  const timeout = new Promise<null>((res) => setTimeout(() => res(null), timeoutMs));
  const emb = embedTexts([safe]).catch(() => null);
  // The Nano rewrite runs in parallel with the embedding call, so it adds no waiting of its own.
  const [got, rw] = await Promise.all([
    Promise.race([emb, timeout]),
    rewrite ? rewriteQuery(safe) : Promise.resolve(null),
  ]);
  const lexicalRw = rw && rw.query !== safe ? bm25Rank(rw.query, store) : null;
  if (!got) {
    return { question: safe, hits: (lexicalRw ?? lexical).slice(0, k), rewrite: rw ?? undefined, mode: "keyword-fallback" };
  }

  // reciprocal rank fusion of the vector ranking and the keyword ranking(s)
  const vec = topK(got.vectors[0], store, store.length);
  const fused = new Map<string, number>();
  const add = (list: { chunk: StoredChunk }[]) => list.forEach((x, i) => fused.set(x.chunk.id, (fused.get(x.chunk.id) ?? 0) + 1 / (60 + i)));
  add(vec);
  add(lexical);
  if (lexicalRw) add(lexicalRw);
  const byId = new Map(store.map((c) => [c.id, c]));
  const hits = [...fused.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, k)
    .map(([id, score]) => ({ chunk: byId.get(id)!, score }));
  return { question: safe, hits, wire: got.wires[0], rewrite: rw ?? undefined, mode: "hybrid" };
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
      payload: { messages: chatMessages(safe, chunks) }, // the exact messages array the server sends to the model
      latencyMs: Date.now() - t0,
    },
  };
}

/** Asks Nemotron Ultra to check the answer against the same chunks. */
export function judgeAnswer(
  question: string,
  answer: string,
  chunks: { text: string }[],
  opts: { regenerate?: boolean } = {},
): Promise<JudgeResponse> {
  return postJson<JudgeResponse>("/api/judge", {
    question: redactQuestion(question),
    answer,
    chunks: chunks.map((c) => ({ text: c.text })),
    // With regenerate: true a low score (< 3) triggers one strict regeneration. If the response has
    // revisedAnswer, the UI MUST show it instead of the original text, because the verdict is for it.
    ...(opts.regenerate ? { regenerate: true } : {}),
  });
}
