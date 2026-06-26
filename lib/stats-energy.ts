import type { StatPoint } from "@/lib/ha-stats";
import type { SolarHistoryPoint } from "@/lib/types";

/** Som van `change` over de punten, geschaald (meters: 1; solar Wh→kWh: 0.001).
 *  null wanneer er geen punten/numerieke waarden zijn. Zero is een echte waarde. */
export function sumChange(points: StatPoint[] | undefined, scale = 1): number | null {
  if (!points || points.length === 0) return null;
  const vals = points.map((p) => p.change).filter((v): v is number => v != null);
  if (vals.length === 0) return null;
  return Math.round(vals.reduce((a, b) => a + b, 0) * scale * 1000) / 1000;
}

/** Statistics-punten → grafiek-bars (per-bucket waarde), geschaald. */
export function barPoints(points: StatPoint[] | undefined, scale = 1): SolarHistoryPoint[] {
  return (points ?? []).map((p) => ({
    t: p.start,
    value: p.change != null ? Math.round(p.change * scale * 100) / 100 : null,
  }));
}
