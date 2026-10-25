import { chatStream, MODELS, MOCK } from "@/lib/ai";
export const maxDuration = 60;

const SYSTEM = `You are a careful enterprise document analyst. Answer ONLY using the numbered context.
Cite sources like [1] or [2] after each claim. Placeholders such as [PERSON_1] are redacted values; never guess what they stand for.
If the context does not contain the answer, reply exactly: "I do not have enough information."`;

export async function POST(req: Request) {
  const { question, chunks } = await req.json();
  const context = chunks.map((c: { text: string }, i: number) => `[${i + 1}] ${c.text}`).join("\n\n");
  const messages = [
    { role: "system" as const, content: SYSTEM },
    { role: "user" as const, content: `CONTEXT:\n${context}\n\nQUESTION: ${question}` },
  ];
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
