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
