import { getStates, statusForError } from "@/lib/ha-client";
import { mapHaStatesToAppState } from "@/lib/state-mapper";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  try {
    const states = await getStates();
    return Response.json(mapHaStatesToAppState(states));
  } catch (e) {
    return Response.json({ error: "state_unavailable" }, { status: statusForError(e) });
  }
}
