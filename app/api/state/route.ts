import { getStates, statusForError } from "@/lib/ha-client";
import { mapHaStatesToAppState } from "@/lib/state-mapper";
import { getActiveScene } from "@/lib/active-scene";
import { getSettings } from "@/lib/settings-store";
import { getSceneGradients } from "@/lib/hue-bridge";
import { ROOMS } from "@/config/devices";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  try {
    const [states, sceneGradients] = await Promise.all([getStates(), getSceneGradients()]);
    const activeScenes = Object.fromEntries(ROOMS.map((r) => [r.key, getActiveScene(r.key)]));
    const settings = getSettings();
    return Response.json(
      mapHaStatesToAppState(states, activeScenes, settings.favorites, sceneGradients, settings.hiddenMetrics),
    );
  } catch (e) {
    return Response.json({ error: "state_unavailable" }, { status: statusForError(e) });
  }
}
