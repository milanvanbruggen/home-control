import { z } from "zod";
import { callService } from "@/lib/ha-client";
import { isAllowedScene } from "@/config/devices";

export const dynamic = "force-dynamic";

const bodySchema = z.object({ id: z.string() });

export async function POST(req: Request): Promise<Response> {
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "bad_request" }, { status: 400 });
  if (!isAllowedScene(parsed.data.id)) return Response.json({ error: "not_allowed" }, { status: 400 });
  try {
    await callService("scene", "turn_on", { entity_id: parsed.data.id });
  } catch {
    return Response.json({ error: "ha_call_failed" }, { status: 502 });
  }
  return Response.json({ ok: true });
}
