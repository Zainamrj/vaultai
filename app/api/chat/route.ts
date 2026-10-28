import { z } from "zod";
import { chatStream, MODELS, MOCK } from "@/lib/ai";
import { chatMessages } from "@/lib/prompts";
export const maxDuration = 60;

const Body = z.object({
  question: z.string().min(1).max(2000),
  chunks: z.array(z.object({ text: z.string().max(6000) })).min(1).max(8),
});

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Invalid request." }, { status: 400 });
  const { question, chunks } = parsed.data;

  // Same builder the browser uses for the Wire Inspector, so the inspector shows exactly this.
  const messages = chatMessages(question, chunks);
  const enc = new TextEncoder();
  const body = new ReadableStream({
    async start(controller) {
      try {
        for await (const t of chatStream(messages)) controller.enqueue(enc.encode(t));
        controller.close();
      } catch (e) {
        controller.error(e);
      }
    },
  });
  return new Response(body, {
    headers: { "Content-Type": "text/plain; charset=utf-8", "X-Wire-Model": MOCK ? "mock" : MODELS.main },
  });
}
