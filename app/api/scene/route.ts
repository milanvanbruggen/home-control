import { z } from "zod";
import { callService } from "@/lib/ha-client";
import { sceneService } from "@/config/devices";
import { setActiveScene, clearActiveScene } from "@/lib/active-scene";

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
  // HA can't report the active scene — remember it ourselves. A real scene
  // (scene.turn_on) becomes active; the "Uit" function (light.turn_off) clears it.
  if (svc.domain === "scene") setActiveScene(parsed.data.id);
  else clearActiveScene();
  return Response.json({ ok: true });
}
