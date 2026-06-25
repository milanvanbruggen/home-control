import type { HaEntityState } from "@/lib/types";
import { ROOM_METRICS } from "@/config/devices";
import { numericState } from "@/lib/metrics";
import type { MetricSample } from "@/lib/metrics-history";

/** One timestamped sample of every configured room metric. */
export function sampleFromStates(states: HaEntityState[], now: number): MetricSample {
  const byId = new Map(states.map((s) => [s.entity_id, s] as const));
  const v: Record<string, number | null> = {};
  for (const room of ROOM_METRICS) {
    for (const s of room.sensors) {
      v[`${room.key}.${s.kind}`] = numericState(byId.get(s.entityId));
    }
  }
  return { t: now, v };
}
