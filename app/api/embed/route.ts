import { embed, MODELS, MOCK } from "@/lib/ai";
export const maxDuration = 60;

export async function POST(req: Request) {
  const { texts } = await req.json();
  const t0 = Date.now();
  const vectors = await embed(texts);
  return Response.json({
    vectors,
    wire: {
      model: MOCK ? "mock" : MODELS.embed,
      payload: { count: texts.length, sample: texts[0]?.slice(0, 120) },
      latencyMs: Date.now() - t0,
    },
  });
}
