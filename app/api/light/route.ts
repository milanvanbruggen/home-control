import { z } from "zod";
import { callService, statusForError } from "@/lib/ha-client";
import { isAllowedLight, ALL_LIGHT_GROUPS } from "@/config/devices";
import { clearAllActiveScenes } from "@/lib/active-scene";

export const dynamic = "force-dynamic";

const bodySchema = z.object({ id: z.string(), brightness: z.number() });

export async function POST(req: Request): Promise<Response> {
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "bad_request" }, { status: 400 });

  const { id, brightness } = parsed.data;

  // Whole-house master off.
  if (id === "all") {
    try {
      await callService("light", "turn_off", { entity_id: ALL_LIGHT_GROUPS });
    } catch (e) {
      return Response.json({ error: "ha_call_failed" }, { status: statusForError(e) });
    }
    clearAllActiveScenes();
    return Response.json({ ok: true });
  }

  if (!isAllowedLight(id)) return Response.json({ error: "not_allowed" }, { status: 400 });
  if (!Number.isInteger(brightness) || brightness < 0 || brightness > 100) {
    return Response.json({ error: "bad_brightness" }, { status: 400 });
  }

  try {
    if (brightness === 0) {
      await callService("light", "turn_off", { entity_id: id });
    } else {
      await callService("light", "turn_on", { entity_id: id, brightness_pct: brightness });
    }
  } catch (e) {
    return Response.json({ error: "ha_call_failed" }, { status: statusForError(e) });
  }
  return Response.json({ ok: true });
}
