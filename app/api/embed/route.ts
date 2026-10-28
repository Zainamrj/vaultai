import { z } from "zod";
import { embed, MODELS, MOCK } from "@/lib/ai";
export const maxDuration = 60;

// Limits keep a public demo URL from being used to burn model credits.
const Body = z.object({ texts: z.array(z.string().min(1).max(6000)).min(1).max(64) });

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Invalid request." }, { status: 400 });
  const { texts } = parsed.data;

  const t0 = Date.now();
  try {
    const { vectors, tokens } = await embed(texts);
    return Response.json({
      vectors,
      wire: {
        model: MOCK ? "mock" : MODELS.embed,
        payload: { count: texts.length, sample: texts[0]?.slice(0, 120) },
        tokens,
        latencyMs: Date.now() - t0,
      },
    });
  } catch {
    return Response.json({ error: "The embedding service did not respond. Try again." }, { status: 502 });
  }
}
