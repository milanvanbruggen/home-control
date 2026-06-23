// Which Hue scene the visitor last activated *via this app*.
//
// HA/Hue scenes are stateless — HA does not expose the currently active scene —
// so we remember it ourselves. Module-level in-memory state: a single Node
// process (the add-on / dev server), shared across all visitor devices, reset
// on restart. It is NOT known for scenes set elsewhere (e.g. directly in the
// Hue app) — only for scenes activated through this app.

let active: string | null = null;

export function getActiveScene(): string | null {
  return active;
}

export function setActiveScene(id: string): void {
  active = id;
}

export function clearActiveScene(): void {
  active = null;
}
