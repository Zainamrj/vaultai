import { z } from "zod";
import { chatOnce, chatStream, MODELS, MOCK } from "@/lib/ai";
import { chatMessages, extractJson, judgeMessages, type SourceChunk } from "@/lib/prompts";
export const maxDuration = 60;

const Body = z.object({
  question: z.string().min(1).max(2000),
  answer: z.string().min(1).max(8000),
  chunks: z.array(z.object({ text: z.string().max(6000) })).min(1).max(8),
  /** Opt-in: if the score is below 3, regenerate once with a strict prompt, re-judge, keep the better. */
  regenerate: z.boolean().optional(),
});

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
type Judged = z.infer<typeof Schema>;

const UNVERIFIED: Judged = { claims: [], score: 1, verdict: "unverified" };

/** One judged attempt: up to two model calls, then a safe "unverified" fallback. Never throws. */
async function judgeOnce(question: string, answer: string, chunks: SourceChunk[]) {
  const messages = judgeMessages(question, answer, chunks);
  const t0 = Date.now();
  let tokens = 0;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const r = await chatOnce(messages, MODELS.judge);
      tokens += r.tokens ?? 0;
      // extractJson also copes with fences and reasoning text before/after the JSON
      return { result: Schema.parse(extractJson(r.text)), messages, tokens, latencyMs: Date.now() - t0, failed: false };
    } catch {
      /* retry once, then fall through */
    }
  }
  return { result: UNVERIFIED, messages, tokens, latencyMs: Date.now() - t0, failed: true };
}

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Invalid request." }, { status: 400 });
  const { question, answer, chunks, regenerate } = parsed.data;

  const model = MOCK ? "mock" : MODELS.judge;
  const wireOf = (j: Awaited<ReturnType<typeof judgeOnce>>) => ({
    model,
    payload: { messages: j.messages }, // exactly what Nemotron Ultra received
    tokens: j.tokens || undefined,
    latencyMs: j.latencyMs,
  });

  const first = await judgeOnce(question, answer, chunks);

  // A failed judge call is not a low score: only regenerate when the judge actually ran.
  if (regenerate && !first.failed && first.result.score < 3) {
    try {
      const messages = chatMessages(question, chunks, true);
      const t0 = Date.now();
      let revised = "";
      for await (const piece of chatStream(messages, MODELS.main, 1500)) revised += piece;
      revised = revised.trim();
      const regenWire = { model: MOCK ? "mock" : MODELS.main, payload: { messages }, latencyMs: Date.now() - t0 };

      if (revised) {
        const second = await judgeOnce(question, revised, chunks);
        if (!second.failed && second.result.score > first.result.score) {
          return Response.json({
            ...second.result,
            wire: wireOf(second),
            regenerated: true,
            revisedAnswer: revised,
            regenWire,
            firstAttempt: first.result,
          });
        }
      }
    } catch {
      /* regeneration is best effort: fall through and return the original verdict */
    }
  }

  // verificationFailed: the judge call itself failed twice. That is an infrastructure problem, not a verdict
  // on the answer, so the UI should say "could not verify" instead of showing a red Unverified badge.
  return Response.json({
    ...first.result,
    wire: wireOf(first),
    ...(first.failed ? { verificationFailed: true } : {}),
  });
}
