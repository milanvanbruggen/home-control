import { getStates, statusForError } from "@/lib/ha-client";
import { mapHaStatesToAppState } from "@/lib/state-mapper";
import { getActiveScene } from "@/lib/active-scene";
import { ROOMS } from "@/config/devices";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  try {
    const states = await getStates();
    const activeScenes = Object.fromEntries(ROOMS.map((r) => [r.key, getActiveScene(r.key)]));
    return Response.json(mapHaStatesToAppState(states, activeScenes));
  } catch (e) {
    return Response.json({ error: "state_unavailable" }, { status: statusForError(e) });
  }
}
