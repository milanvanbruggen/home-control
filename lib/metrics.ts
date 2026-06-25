import type { MetricKind, MetricValue } from "@/lib/types";
import type { MsgKey } from "@/lib/i18n";

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
