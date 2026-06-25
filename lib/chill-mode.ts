// The last cool/heat mode a Chill was seen in, per chill id.
//
// When a Chill is off, HA reports state "off" with no attribute retaining the
// cool/heat selection — so we remember it ourselves to still show the mode while
// off. Module-level in-memory state: a single Node process (the add-on / dev
// server), shared across visitor devices, reset on restart (then null until the
// chill is next seen on).

type Mode = "cool" | "heat";

const lastMode: Record<string, Mode> = {};

export function getLastChillMode(id: string): Mode | null {
  return lastMode[id] ?? null;
}

export function setLastChillMode(id: string, mode: Mode): void {
  lastMode[id] = mode;
}

/** Clear one chill's remembered mode, or (no arg) all — handy for test resets. */
export function clearLastChillMode(id?: string): void {
  if (id === undefined) {
    for (const k of Object.keys(lastMode)) delete lastMode[k];
    return;
  }
  delete lastMode[id];
}
