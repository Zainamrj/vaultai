import { MOCK } from "@/lib/ai";

export async function GET() {
  return Response.json({ mock: MOCK });
}
