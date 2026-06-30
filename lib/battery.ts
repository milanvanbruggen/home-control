export type BatteryLevel = "full" | "medium" | "low" | "warning";

/** Map a battery percentage to an icon level + a `low` flag (drives red emphasis). */
export function batteryLevel(pct: number): { level: BatteryLevel; low: boolean } {
  const level: BatteryLevel = pct >= 60 ? "full" : pct >= 30 ? "medium" : pct >= 10 ? "low" : "warning";
  return { level, low: pct < 20 };
}
