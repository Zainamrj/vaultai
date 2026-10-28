import { z } from "zod";
import { chatOnce, MODELS, MOCK } from "@/lib/ai";
import { rewriteMessages } from "@/lib/prompts";
export const maxDuration = 60;

// Light task routed to Nemotron Nano: turn the (already redacted) question into a short search query.
const Body = z.object({ question: z.string().min(1).max(2000) });

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Invalid request." }, { status: 400 });
  const { question } = parsed.data;

  const messages = rewriteMessages(question);
  const t0 = Date.now();
  let query = question;
  let tokens: number | undefined;

  if (!MOCK) {
    try {
      // Reasoning models spend tokens thinking first, so the limit is generous.
      const r = await chatOnce(messages, MODELS.fast, 600);
      tokens = r.tokens;
      const line = r.text.split("\n").map((l) => l.trim()).find(Boolean) ?? "";
      const cleaned = line.replace(/^["'`]+|["'`]+$/g, "").slice(0, 200);
      if (cleaned) query = cleaned;
    } catch {
      return Response.json({ error: "The rewrite service did not respond." }, { status: 502 });
    }
  }

  return Response.json({
    query,
    wire: { model: MOCK ? "mock" : MODELS.fast, payload: { messages }, tokens, latencyMs: Date.now() - t0 },
  });
}
