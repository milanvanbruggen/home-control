import type { AppState } from "@/lib/types";

/**
 * Stable ids for every home-screen card, in their default order:
 * lights, thermostat, each chill (by climate id), then each metric room with a
 * visible metric (by room key). Used to drive the user-configurable card order.
 */
export function defaultCardIds(state: AppState): string[] {
  const ids: string[] = ["solar"];
  if (state.rooms.length > 0) ids.push("lights");
  if (state.thermostat) ids.push("thermostat");
  for (const c of state.chills) ids.push(c.id);
  for (const r of state.metrics) {
    if (r.metrics.some((m) => m.visible)) ids.push(r.key);
  }
  return ids;
}

/**
 * Apply a saved order to the current card set: saved ids that still exist first
 * (in saved order), then any cards not in the saved order in their default order.
 * Stale ids in `saved` (cards that no longer exist) are dropped.
 */
export function orderCardIds(defaultIds: string[], saved: string[]): string[] {
  const present = new Set(defaultIds);
  const ordered = saved.filter((id) => present.has(id));
  const seen = new Set(ordered);
  for (const id of defaultIds) if (!seen.has(id)) ordered.push(id);
  return ordered;
}
