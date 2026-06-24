import { callService, statusForError } from "@/lib/ha-client";
import { WATER_ALERT } from "@/config/devices";
import { waterTestNotify } from "@/lib/water-alert";
import { getSettings } from "@/lib/settings-store";

export const dynamic = "force-dynamic";

/** Fire a test water-alert to the LaMetric (used by the settings "Send test" button). */
export async function POST(): Promise<Response> {
  const { language } = getSettings();
  try {
    await callService(WATER_ALERT.notifyDomain, WATER_ALERT.notifyService, waterTestNotify(language));
  } catch (e) {
    return Response.json({ error: "ha_call_failed" }, { status: statusForError(e) });
  }
  return Response.json({ ok: true });
}
