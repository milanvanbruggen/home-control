import { z } from "zod";
import { callService } from "@/lib/ha-client";
import { sceneService } from "@/config/devices";

export const dynamic = "force-dynamic";

const bodySchema = z.object({ id: z.string() });

export async function POST(req: Request): Promise<Response> {
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "bad_request" }, { status: 400 });
  const svc = sceneService(parsed.data.id);
  if (!svc) return Response.json({ error: "not_allowed" }, { status: 400 });
  try {
    await callService(svc.domain, svc.service, svc.data);
  } catch {
    return Response.json({ error: "ha_call_failed" }, { status: 502 });
  }
  return Response.json({ ok: true });
}
