import { z } from "zod";
import { removeSubscription } from "@/lib/push-store";

export const dynamic = "force-dynamic";

const schema = z.object({ endpoint: z.string() });

export async function POST(req: Request): Promise<Response> {
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "bad_request" }, { status: 400 });
  removeSubscription(parsed.data.endpoint);
  return Response.json({ ok: true });
}
