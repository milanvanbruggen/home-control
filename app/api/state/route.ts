import { getStates, statusForError } from "@/lib/ha-client";
import { mapHaStatesToAppState } from "@/lib/state-mapper";
import { getActiveScene } from "@/lib/active-scene";
import { getLastChillMode, setLastChillMode } from "@/lib/chill-mode";
import { getSettings } from "@/lib/settings-store";
import { getSceneGradients } from "@/lib/hue-bridge";
import { ROOMS } from "@/config/devices";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  try {
    const [states, sceneGradients] = await Promise.all([getStates(), getSceneGradients()]);
    const activeScenes = Object.fromEntries(ROOMS.map((r) => [r.key, getActiveScene(r.key)]));
    const settings = getSettings();
    const app = mapHaStatesToAppState(states, activeScenes, settings.favorites, sceneGradients, settings.hiddenMetrics);
    // HA drops the cool/heat selection when a Chill is off; remember it while on so
    // the off card can still show which mode it was in.
    for (const ch of app.chills) {
      if (ch.lastMode) setLastChillMode(ch.id, ch.lastMode);
      else ch.lastMode = getLastChillMode(ch.id);
    }
    return Response.json(app);
  } catch (e) {
    return Response.json({ error: "state_unavailable" }, { status: statusForError(e) });
  }
}
