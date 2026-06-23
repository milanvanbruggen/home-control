import { z } from "zod";
import { getStates, callService, statusForError } from "@/lib/ha-client";
import { parseRoomUit, findRoomByGroupName, ALLOWED_ROOM_GROUP_NAMES } from "@/config/devices";
import { setActiveScene, clearActiveScene } from "@/lib/active-scene";

export const dynamic = "force-dynamic";

const bodySchema = z.object({ id: z.string() });

export async function POST(req: Request): Promise<Response> {
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "bad_request" }, { status: 400 });
  const { id } = parsed.data;

  // Per-room "Uit": turn the room's light group off.
  const uitRoom = parseRoomUit(id);
  if (uitRoom) {
    try {
      await callService("light", "turn_off", { entity_id: uitRoom.lightGroup });
    } catch (e) {
      return Response.json({ error: "ha_call_failed" }, { status: statusForError(e) });
    }
    clearActiveScene(uitRoom.key);
    return Response.json({ ok: true });
  }

  // Real scene: only a scene.* entity belonging to one of the allowed rooms may fire.
  // Validated against live HA state (scene group_type + group_name) — the security boundary.
  if (!id.startsWith("scene.")) return Response.json({ error: "not_allowed" }, { status: 400 });

  let entity;
  try {
    entity = (await getStates()).find((s) => s.entity_id === id);
  } catch (e) {
    return Response.json({ error: "ha_unavailable" }, { status: statusForError(e) });
  }

  const groupName = entity?.attributes.group_name;
  if (
    !entity ||
    entity.attributes.group_type !== "room" ||
    typeof groupName !== "string" ||
    !ALLOWED_ROOM_GROUP_NAMES.has(groupName)
  ) {
    return Response.json({ error: "not_allowed" }, { status: 400 });
  }

  try {
    await callService("scene", "turn_on", { entity_id: id });
  } catch (e) {
    return Response.json({ error: "ha_call_failed" }, { status: statusForError(e) });
  }

  const room = findRoomByGroupName(groupName);
  if (room) setActiveScene(room.key, id);
  return Response.json({ ok: true });
}
