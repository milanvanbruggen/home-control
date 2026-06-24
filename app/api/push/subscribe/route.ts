import { z } from "zod";
import { addSubscription } from "@/lib/push-store";

export const dynamic = "force-dynamic";

const schema = z.object({
  endpoint: z.string().url(),
  keys: z.object({ p256dh: z.string(), auth: z.string() }),
});

export async function POST(req: Request): Promise<Response> {
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "bad_request" }, { status: 400 });
  addSubscription({ endpoint: parsed.data.endpoint, keys: parsed.data.keys });
  return Response.json({ ok: true });
}
