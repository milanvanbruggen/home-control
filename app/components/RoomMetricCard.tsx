"use client";
import { useEffect, useState } from "react";
import { Thermometer, Droplets } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, ResponsiveContainer } from "recharts";
import type { RoomMetrics, MetricValue, MetricKind } from "@/lib/types";
import type { MsgKey } from "@/lib/i18n";
import { Card } from "@/app/components/ui/card";
import { useT } from "@/app/components/LanguageProvider";
import { formatMetricValue, METRIC_LABEL_KEY } from "@/lib/metrics";

type Range = "24h" | "7d" | "30d";
type Point = { t: number; value: number | null };
type Series = { kind: MetricKind; unit: string; points: Point[] };

const RANGES: Range[] = ["24h", "7d", "30d"];
const RANGE_LABEL_KEY: Record<Range, MsgKey> = {
  "24h": "history.range24h",
  "7d": "history.range7d",
  "30d": "history.range30d",
};
const KIND_COLOR: Record<MetricKind, string> = { temperature: "#f0913f", humidity: "#3aa6dd" };

function MetricChartPanel({ metric, points }: { metric: MetricValue; points: Point[] }) {
  const t = useT();
  const Icon = metric.kind === "temperature" ? Thermometer : Droplets;
  const color = KIND_COLOR[metric.kind];
  const usable = points.filter((p) => p.value != null);

  return (
    <div className="min-w-0">
      <div className="flex items-center gap-2">
        <Icon size={18} aria-hidden style={{ color }} />
        <p className="font-display text-xl font-semibold leading-none tabular-nums">{formatMetricValue(metric)}</p>
        <p className="text-xs text-[var(--muted)]">{t(METRIC_LABEL_KEY[metric.kind])}</p>
      </div>
      <div className="mt-2 h-24">
        {usable.length < 2 ? (
          <div className="flex h-full items-center justify-center text-xs text-[var(--muted)]">
            {t("history.collecting")}
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={points} margin={{ top: 4, right: 6, bottom: 0, left: 6 }}>
              <XAxis dataKey="t" type="number" domain={["dataMin", "dataMax"]} hide />
              <YAxis domain={["dataMin - 1", "dataMax + 1"]} hide />
              <Line type="monotone" dataKey="value" stroke={color} strokeWidth={2} dot={false} isAnimationActive={false} connectNulls={false} />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}

export function RoomMetricCard({ room }: { room: RoomMetrics }) {
  const t = useT();
  const visible = room.metrics.filter((m) => m.visible);
  const [range, setRange] = useState<Range>("24h");
  const [seriesMap, setSeriesMap] = useState<Record<string, Point[]>>({});

  useEffect(() => {
    if (visible.length === 0) return;
    let alive = true;
    fetch(`/api/history?room=${encodeURIComponent(room.key)}&range=${range}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("bad"))))
      .then((d: { series?: Series[] }) => {
        if (!alive) return;
        const next: Record<string, Point[]> = {};
        for (const s of d.series ?? []) next[s.kind] = s.points;
        setSeriesMap(next);
      })
      .catch(() => { if (alive) setSeriesMap({}); });
    return () => { alive = false; };
  }, [room.key, range, visible.length]);

  if (visible.length === 0) return null;

  return (
    <Card aria-label={room.name}>
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-lg font-semibold tracking-tight">{room.name}</h2>
        <div role="radiogroup" aria-label={room.name} className="flex rounded-full bg-foreground/[0.06] p-0.5 text-xs">
          {RANGES.map((r) => {
            const active = r === range;
            return (
              <button
                key={r}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => setRange(r)}
                className={`rounded-full px-2.5 py-1 font-medium transition ${active ? "bg-[var(--card)] text-foreground shadow-sm" : "text-[var(--muted)]"}`}
              >
                {t(RANGE_LABEL_KEY[r])}
              </button>
            );
          })}
        </div>
      </div>
      <div className={`mt-3 grid gap-4 ${visible.length >= 2 ? "grid-cols-2" : "grid-cols-1"}`}>
        {visible.map((m) => (
          <MetricChartPanel
            key={m.kind}
            metric={m}
            points={seriesMap[m.kind] ?? []}
          />
        ))}
      </div>
    </Card>
  );
}
