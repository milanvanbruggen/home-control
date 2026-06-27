import { getStates, statusForError } from "@/lib/ha-client";
import { mapHaStatesToAppState } from "@/lib/state-mapper";
import { getActiveScene } from "@/lib/active-scene";
import { getLastChillMode, setLastChillMode } from "@/lib/chill-mode";
import { getSettings } from "@/lib/settings-store";
import { getSceneGradients } from "@/lib/hue-bridge";
import { ROOMS } from "@/config/devices";
import { getClearSkyEnvelope, applySunStrength } from "@/lib/sun-strength";
import { applySolarHold } from "@/lib/solar-hold";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  try {
    const [states, sceneGradients, envelope] = await Promise.all([getStates(), getSceneGradients(), getClearSkyEnvelope()]);
    const activeScenes = Object.fromEntries(ROOMS.map((r) => [r.key, getActiveScene(r.key)]));
    const settings = getSettings();
    const app = mapHaStatesToAppState(states, activeScenes, settings.favorites, sceneGradients, settings.hiddenMetrics);
    // Brighten the weather backdrop when the panels prove the sun is actually out
    // (forecast cloud coverage is often too pessimistic). No-op without history.
    applySunStrength(app.solar, envelope, Date.now());
    // Hold last-good SolarEdge production across brief integration dropouts so a
    // transient `unavailable` doesn't blank the whole card.
    applySolarHold(app.solar, Date.now());
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
