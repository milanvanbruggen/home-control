// Which Hue scene the visitor last activated *via this app*, per room.
//
// HA/Hue scenes are stateless — HA does not expose the currently active scene —
// so we remember it ourselves, keyed by room. Module-level in-memory state: a
// single Node process (the add-on / dev server), shared across all visitor
// devices, reset on restart. It is NOT known for scenes set elsewhere (e.g.
// directly in the Hue app) — only for scenes activated through this app.

const active: Record<string, string | null> = {};

export function getActiveScene(roomKey: string): string | null {
  return active[roomKey] ?? null;
}

export function setActiveScene(roomKey: string, id: string): void {
  active[roomKey] = id;
}

/** Clear one room's active scene, or (no arg) all rooms — handy for test resets. */
export function clearActiveScene(roomKey?: string): void {
  if (roomKey === undefined) {
    for (const k of Object.keys(active)) delete active[k];
    return;
  }
  active[roomKey] = null;
}
