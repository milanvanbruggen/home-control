import type { SolarHistoryPoint } from "@/lib/types";

export interface RawPoint {
  t: number;
  v: number;
}

const DAY_MS = 86_400_000;

/** HA minimal-history states → numerieke, chronologisch gesorteerde punten. */
export function parseHistory(states: { state: string; last_changed: string }[]): RawPoint[] {
  const out: RawPoint[] = [];
  for (const s of states) {
    const t = Date.parse(s.last_changed);
    const v = Number(s.state);
    if (!Number.isNaN(t) && !Number.isNaN(v)) out.push({ t, v });
  }
  return out.sort((a, b) => a.t - b.t);
}

/** Window [fromMs,toMs] en downsample tot <= maxPoints tijd-gemiddelde buckets. */
export function downsamplePower(
  points: RawPoint[],
  fromMs: number,
  toMs: number,
  maxPoints: number,
): SolarHistoryPoint[] {
  const windowed = points.filter((p) => p.t >= fromMs && p.t <= toMs);
  if (windowed.length <= maxPoints) return windowed.map((p) => ({ t: p.t, value: p.v }));

  const span = toMs - fromMs || 1;
  const buckets = Array.from({ length: maxPoints }, () => ({ sum: 0, count: 0 }));
  for (const p of windowed) {
    let idx = Math.floor(((p.t - fromMs) / span) * maxPoints);
    if (idx < 0) idx = 0;
    if (idx >= maxPoints) idx = maxPoints - 1;
    buckets[idx].sum += p.v;
    buckets[idx].count += 1;
  }
  return buckets.map((b, i) => ({
    t: Math.round(fromMs + ((i + 0.5) / maxPoints) * span),
    value: b.count > 0 ? Math.round(b.sum / b.count) : null,
  }));
}


export function sumKwh(points: SolarHistoryPoint[]): number | null {
  const vals = points.map((p) => p.value).filter((v): v is number => v != null);
  if (vals.length === 0) return null;
  return Math.round(vals.reduce((a, b) => a + b, 0) * 100) / 100;
}

function utcStartOfDay(ms: number): number {
  const d = new Date(ms);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

/**
 * `days` dag-buckets: [start van (vandaag-(days-1)), …, start van vandaag, now].
 * UTC-dag-grenzen (deterministisch + testbaar); 's nachts is de productie ~0, dus
 * UTC vs lokale middernacht geeft praktisch identieke dagtotalen.
 */
export function dayBoundaries(now: number, days: number): number[] {
  const startToday = utcStartOfDay(now);
  const out: number[] = [];
  for (let i = days - 1; i >= 0; i--) out.push(startToday - i * DAY_MS);
  out.push(now);
  return out;
}

/** `months` maand-buckets: 1e van elke maand (UTC) terug, eindigend op now. */
export function monthBoundaries(now: number, months: number): number[] {
  const d = new Date(now);
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth();
  const out: number[] = [];
  for (let i = months - 1; i >= 0; i--) out.push(Date.UTC(y, m - i, 1));
  out.push(now);
  return out;
}
