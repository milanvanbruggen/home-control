import type { StatPoint } from "@/lib/ha-stats";

/** Tunables for the production-driven "strong sun" backdrop override. */
export const SUN_STRENGTH = {
  windowDays: 14,
  sunnyRatio: 0.75,
  partlyRatio: 0.45,
  referenceFloorW: 200,
  minDays: 3,
  ttlMs: 3_600_000,
} as const;

/** A self-calibrating clear-sky curve: the recent max production per local hour-of-day. */
export interface ClearSkyEnvelope {
  /** Length 24. Max production (W) seen at each local hour-of-day, or null if no data. */
  hourMaxW: (number | null)[];
  /** Distinct days that contributed (for the minDays guard). */
  days: number;
  /** IANA timezone the hours are bucketed in. */
  tz: string;
}

function hourInTz(ms: number, tz: string): number {
  return Number(new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", hourCycle: "h23" }).format(new Date(ms)));
}
function hourFractionInTz(ms: number, tz: string): number {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date(ms));
  const h = Number(parts.find((p) => p.type === "hour")!.value);
  const m = Number(parts.find((p) => p.type === "minute")!.value);
  return h + m / 60;
}
function dayKeyInTz(ms: number, tz: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(ms));
}

/** Build the per-hour clear-sky envelope from hourly `max` statistics points. */
export function buildClearSkyEnvelope(points: StatPoint[], tz: string): ClearSkyEnvelope {
  const hourMaxW: (number | null)[] = new Array(24).fill(null);
  const days = new Set<string>();
  for (const p of points) {
    const w = p.max;
    if (w == null || !Number.isFinite(w)) continue;
    const h = hourInTz(p.start, tz);
    if (h < 0 || h > 23) continue;
    const cur = hourMaxW[h];
    hourMaxW[h] = cur == null ? w : Math.max(cur, w);
    days.add(dayKeyInTz(p.start, tz));
  }
  return { hourMaxW, days: days.size, tz };
}

/** Interpolated clear-sky reference (W) at `atMs`, or null if below the low-sun floor / no data. */
export function clearSkyReference(env: ClearSkyEnvelope, atMs: number, floorW: number = SUN_STRENGTH.referenceFloorW): number | null {
  const hf = hourFractionInTz(atMs, env.tz);
  const h0 = Math.floor(hf) % 24;
  const h1 = (h0 + 1) % 24;
  const f = hf - Math.floor(hf);
  const a = env.hourMaxW[h0];
  const b = env.hourMaxW[h1];
  let ref: number | null;
  if (a == null && b == null) ref = null;
  else if (a == null) ref = b;
  else if (b == null) ref = a;
  else ref = a + (b - a) * f;
  if (ref == null || ref < floorW) return null;
  return ref;
}

/** Map current production vs the clear-sky reference to an *implied* cloud coverage (0–100), or
 *  null for "no opinion" (keep the forecast). 20 → sunny, 55 → partly-cloudy via conditionFromCoverage. */
export function productionCloudCoverage(currentW: number | null, reference: number | null): number | null {
  if (currentW == null || reference == null || reference <= 0) return null;
  const ratio = currentW / reference;
  if (ratio >= SUN_STRENGTH.sunnyRatio) return 20;
  if (ratio >= SUN_STRENGTH.partlyRatio) return 55;
  return null;
}

/** Brighten-only blend: the lower (sunnier) of forecast vs production coverage, null-aware. */
export function blendCoverage(forecast: number | null, production: number | null): number | null {
  if (forecast == null) return production;
  if (production == null) return forecast;
  return Math.min(forecast, production);
}
