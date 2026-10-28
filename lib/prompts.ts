// Single source of truth for every prompt the app sends to a model.
// Imported by the API routes, the browser Wire Inspector records, and scripts/eval.mjs,
// so what the eval measures is exactly what the app runs.
// This file must stay dependency-free (no imports) so plain Node can load it.

export type Msg = { role: "system" | "user" | "assistant"; content: string };
export type SourceChunk = { text: string };

export const CHAT_SYSTEM = `You are a careful enterprise document analyst. Answer ONLY using the numbered context.
Cite sources like [1] or [2] after each claim. Placeholders such as [PERSON_1] are redacted values; never guess what they stand for.
If asked for a value that appears only as a placeholder, say the value is redacted in the documents and give the placeholder.
If the question is ambiguous because the context covers several items (for example several medications), list each item with its value instead of guessing one.
If the context does not contain the answer, reply exactly: "I do not have enough information."`;

/** Appended on the single regeneration pass after a low judge score. */
export const STRICT_SUFFIX = `
Answer using only statements directly present in the context. Do not add anything that is not written there.`;

export const JUDGE_SYSTEM = `You are a strict fact-checker. You receive a QUESTION, an ANSWER, and numbered SOURCES.
Rules:
1. Split the ANSWER into atomic claims. Citation markers like [1] are not claims.
2. For each claim decide whether it is directly supported by a source. Give the source number.
3. Placeholders such as [PERSON_1] or [SSN_1] are redacted values. A claim that only states a placeholder is supported if the source contains that placeholder in the right context. If the answer guesses the real value behind a placeholder, mark that claim unsupported.
4. If the ANSWER says the information is not available (for example "I do not have enough information"), return an empty claims list. Set verdict "verified" and score 5 if none of the SOURCES contain the information needed to answer the QUESTION. Set verdict "unverified" and score 1 if the SOURCES do contain it.
5. Score overall grounding from 1 to 5 (5 = every claim supported). Never use 0.
6. Return ONLY valid JSON, no prose, no code fences, in this shape:
{"claims":[{"text":"...","supported":true,"sourceChunkId":"1","note":"..."}],"score":4,"verdict":"verified|partial|unverified"}`;

export const REWRITE_SYSTEM = `You turn a question into a short search query for finding the answer inside a document.
Keep the key nouns, names and numbers. Drop filler words. Keep placeholders such as [PERSON_1] exactly as written.
Return ONLY the query on one line, at most 20 words, with no quotes and no explanation.`;

export const numberedContext = (chunks: SourceChunk[]) =>
  chunks.map((c, i) => `[${i + 1}] ${c.text}`).join("\n\n");

/** The exact messages array sent to the answer model. The Wire Inspector shows this verbatim. */
export function chatMessages(question: string, chunks: SourceChunk[], strict = false): Msg[] {
  return [
    { role: "system", content: strict ? CHAT_SYSTEM + STRICT_SUFFIX : CHAT_SYSTEM },
    { role: "user", content: `CONTEXT:\n${numberedContext(chunks)}\n\nQUESTION: ${question}` },
  ];
}

/** The exact messages array sent to the judge model. */
export function judgeMessages(question: string, answer: string, chunks: SourceChunk[]): Msg[] {
  return [
    { role: "system", content: JUDGE_SYSTEM },
    { role: "user", content: `QUESTION: ${question}\n\nANSWER: ${answer}\n\nSOURCES:\n${numberedContext(chunks)}` },
  ];
}

export function rewriteMessages(question: string): Msg[] {
  return [
    { role: "system", content: REWRITE_SYSTEM },
    { role: "user", content: question },
  ];
}

/**
 * Pulls a JSON value out of model output: strips code fences and any reasoning text before the
 * first "{" or after the last "}". Throws if nothing parseable is found.
 */
export function extractJson(raw: string): unknown {
  const text = raw.replace(/```json|```/gi, "");
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end <= start) throw new Error("no JSON object in model output");
  return JSON.parse(text.slice(start, end + 1));
}
