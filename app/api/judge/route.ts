import { z } from "zod";
import { chatOnce, MODELS, MOCK } from "@/lib/ai";
export const maxDuration = 60;

const JUDGE_PROMPT = `You are a strict fact-checker. You receive a QUESTION, an ANSWER, and numbered SOURCES.
1. Split the ANSWER into atomic claims.
2. For each claim decide if it is directly supported by a source. Give the source number.
3. Score overall grounding 1-5 (5 = every claim supported).
4. Return ONLY valid JSON, no prose, in this shape:
{"claims":[{"text":"...","supported":true,"sourceChunkId":"1","note":"..."}],"score":4,"verdict":"verified|partial|unverified"}`;

const Schema = z.object({
  claims: z.array(
    z.object({
      text: z.string(),
      supported: z.boolean(),
      sourceChunkId: z.string().optional(),
      note: z.string().optional(),
    })
  ),
  score: z.number().min(1).max(5),
  verdict: z.enum(["verified", "partial", "unverified"]),
});

async function callJudge(question: string, answer: string, sources: string) {
  const raw = await chatOnce([
    { role: "system", content: JUDGE_PROMPT },
    { role: "user", content: `QUESTION: ${question}\n\nANSWER: ${answer}\n\nSOURCES:\n${sources}` },
  ]);
  const json = raw.replace(/```json|```/g, "").trim();
  return Schema.parse(JSON.parse(json));
}

export async function POST(req: Request) {
  const { question, answer, chunks } = await req.json();
  const sources = chunks.map((c: { text: string }, i: number) => `[${i + 1}] ${c.text}`).join("\n\n");
  const t0 = Date.now();
  let result;
  try {
    result = await callJudge(question, answer, sources);
  } catch {
    try {
      result = await callJudge(question, answer, sources);
    } catch {
      result = { claims: [], score: 1, verdict: "unverified" as const };
    }
  }
  return Response.json({
    ...result,
    wire: {
      model: MOCK ? "mock" : MODELS.judge,
      payload: { question, answerChars: answer.length },
      latencyMs: Date.now() - t0,
    },
  });
}
