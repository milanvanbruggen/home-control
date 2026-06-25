export interface MetricSample {
  t: number;                          // epoch ms
  v: Record<string, number | null>;   // key = `${roomKey}.${kind}`
}
export interface MetricHistory {
  samples: MetricSample[];
}

export const RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

export const RANGE_MS: Record<"24h" | "7d" | "30d", number> = {
  "24h": 24 * 60 * 60 * 1000,
  "7d": 7 * 24 * 60 * 60 * 1000,
  "30d": 30 * 24 * 60 * 60 * 1000,
};

/** Append one sample, then drop anything older than `now - RETENTION_MS`. */
export function appendAndPrune(history: MetricHistory, sample: MetricSample, now: number): MetricHistory {
  const cutoff = now - RETENTION_MS;
  return { samples: [...history.samples, sample].filter((s) => s.t >= cutoff) };
}

/** Window to [fromMs, now] for one series key; downsample to <= maxPoints buckets
 *  (time-averaged, null when a bucket has no non-null value). */
export function windowAndDownsample(
  samples: MetricSample[],
  key: string,
  fromMs: number,
  now: number,
  maxPoints: number,
): { t: number; value: number | null }[] {
  const points = samples
    .filter((s) => s.t >= fromMs && s.t <= now)
    .map((s) => ({ t: s.t, value: key in s.v ? s.v[key] : null }));
  if (points.length <= maxPoints) return points;

  const span = now - fromMs || 1;
  const buckets = Array.from({ length: maxPoints }, () => ({ sum: 0, count: 0 }));
  for (const p of points) {
    let idx = Math.floor(((p.t - fromMs) / span) * maxPoints);
    if (idx < 0) idx = 0;
    if (idx >= maxPoints) idx = maxPoints - 1;
    if (p.value != null) {
      buckets[idx].sum += p.value;
      buckets[idx].count += 1;
    }
  }
  return buckets.map((b, i) => ({
    t: Math.round(fromMs + ((i + 0.5) / maxPoints) * span),
    value: b.count > 0 ? Math.round((b.sum / b.count) * 10) / 10 : null,
  }));
}
