import type { HaEntityState, MetricKind, MetricValue } from "@/lib/types";
import type { MsgKey } from "@/lib/i18n";

/** Default unit per metric kind, when HA gives no unit_of_measurement. */
export const METRIC_UNIT_FALLBACK: Record<MetricKind, string> = { temperature: "°C", humidity: "%" };

/** Numeric reading of an HA entity, or null when unavailable/unknown/missing/non-numeric. */
export function numericState(e: HaEntityState | undefined): number | null {
  if (!e || e.state === "unavailable" || e.state === "unknown") return null;
  const n = Number(e.state);
  return Number.isNaN(n) ? null : n;
}

/** i18n key for each metric kind's label. */
export const METRIC_LABEL_KEY: Record<MetricKind, MsgKey> = {
  temperature: "metric.temperature",
  humidity: "metric.humidity",
};

/** Display string: temperature one decimal (NL comma), humidity integer; "—" when null. */
export function formatMetricValue(m: MetricValue): string {
  if (m.value == null) return "—";
  const n = m.kind === "temperature" ? m.value.toFixed(1).replace(".", ",") : String(Math.round(m.value));
  return `${n}${m.unit}`;
}

/** Home-grid column span for a metric card: full when 2+ metrics, half when 1. */
export function metricCardSpan(visibleCount: number): "col-span-1" | "col-span-2" {
  return visibleCount >= 2 ? "col-span-2" : "col-span-1";
}

/** Watt → kW, op 2 decimalen; null blijft null. */
export function wattsToKw(w: number | null): number | null {
  return w == null ? null : Math.round((w / 1000) * 100) / 100;
}

/** kW-waarde als nl-NL string met 2 decimalen; "—" bij null. */
export function formatKw(kw: number | null): string {
  if (kw == null) return "—";
  return kw.toFixed(2).replace(".", ",");
}

/** kWh-waarde als nl-NL string met 1 decimaal; "—" bij null. */
export function formatKwh(kwh: number | null): string {
  if (kwh == null) return "—";
  return kwh.toFixed(1).replace(".", ",");
}

/** Procent afgerond als hele string; "—" bij null. */
export function formatPercent(pct: number | null): string {
  if (pct == null) return "—";
  return String(Math.round(pct));
}
