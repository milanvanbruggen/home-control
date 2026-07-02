"use client";
import { useEffect, useState } from "react";
import { Thermometer, Droplets, ChevronDown } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import type { RoomMetrics, MetricValue, MetricKind, ComfortStatus } from "@/lib/types";
import type { MsgKey } from "@/lib/i18n";
import { Card } from "@/app/components/ui/card";
import { Menu, MenuItem } from "@/app/components/ui/menu";
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

const COMFORT_COLOR: Record<ComfortStatus, string> = {
  comfortable: "#22b39e",
  humid: "var(--accent-warn)",
  dry: "var(--accent-warn)",
  condensation: "#e85f4c",
};

const COMFORT_BG: Record<ComfortStatus, string> = {
  comfortable: "rgba(34,179,158,0.15)",
  humid: "rgba(var(--accent-warn-rgb,245,158,11),0.15)",
  dry: "rgba(var(--accent-warn-rgb,245,158,11),0.15)",
  condensation: "rgba(232,95,76,0.15)",
};

const STATUS_KEY: Record<ComfortStatus, MsgKey> = {
  comfortable: "comfort.comfortable",
  humid: "comfort.humid",
  dry: "comfort.dry",
  condensation: "comfort.condensation",
};

/** Compact range picker: a pill that opens the shared dropdown menu — fits even a
 *  half-width card where the old 3-button segmented control overflowed. */
function RangeMenu({ range, onChange, roomName }: { range: Range; onChange: (r: Range) => void; roomName: string }) {
  const t = useT();
  return (
    <Menu
      label={`${roomName}: ${t(RANGE_LABEL_KEY[range])}`}
      className="shrink-0"
      align="right"
      width="w-28"
      triggerClassName="flex items-center gap-1 rounded-full bg-foreground/[0.06] px-2.5 py-1 text-xs font-medium text-[var(--muted)] transition hover:bg-foreground/10 active:scale-95"
      trigger={
        <>
          {t(RANGE_LABEL_KEY[range])}
          <ChevronDown size={13} aria-hidden />
        </>
      }
    >
      {(close) =>
        RANGES.map((r) => (
          <MenuItem
            key={r}
            selected={r === range}
            onSelect={() => {
              onChange(r);
              close();
            }}
          >
            {t(RANGE_LABEL_KEY[r])}
          </MenuItem>
        ))
      }
    </Menu>
  );
}

/** X-axis label: clock time for 24h, day/month for the longer ranges. */
function fmtAxisTime(ms: number, range: Range): string {
  const d = new Date(ms);
  return range === "24h"
    ? d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    : d.toLocaleDateString([], { day: "numeric", month: "numeric" });
}

function MetricChartPanel({ metric, points, range }: { metric: MetricValue; points: Point[]; range: Range }) {
  const t = useT();
  const Icon = metric.kind === "temperature" ? Thermometer : Droplets;
  const color = KIND_COLOR[metric.kind];
  const usable = points.filter((p) => p.value != null);
  const unitSuffix = metric.kind === "temperature" ? "°" : "%";

  return (
    <div className="min-w-0">
      <div className="flex items-center gap-2">
        <Icon size={18} aria-hidden style={{ color }} className="shrink-0" />
        <p className="text-xl font-bold leading-none tabular-nums shrink-0">{formatMetricValue(metric)}</p>
        <p className="truncate text-xs text-[var(--muted)]">{t(METRIC_LABEL_KEY[metric.kind])}</p>
      </div>
      <div className="mt-2 h-32">
        {usable.length < 2 ? (
          <div className="flex h-full items-center justify-center text-xs text-[var(--muted)]">
            {t("history.collecting")}
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={points} margin={{ top: 6, right: 8, bottom: 0, left: 0 }}>
              <CartesianGrid stroke="var(--card-border)" strokeDasharray="3 3" vertical={false} />
              <XAxis
                dataKey="t"
                type="number"
                scale="time"
                domain={["dataMin", "dataMax"]}
                tickFormatter={(v) => fmtAxisTime(Number(v), range)}
                tick={{ fontSize: 10, fill: "var(--muted)" }}
                tickLine={false}
                axisLine={false}
                minTickGap={36}
              />
              <YAxis
                domain={["dataMin - 1", "dataMax + 1"]}
                width={34}
                tickCount={4}
                tickFormatter={(v) => `${Math.round(Number(v))}${unitSuffix}`}
                tick={{ fontSize: 10, fill: "var(--muted)" }}
                tickLine={false}
                axisLine={false}
              />
              <Tooltip
                cursor={{ stroke: "var(--card-border)" }}
                contentStyle={{
                  borderRadius: "0.75rem",
                  border: "1px solid var(--card-border)",
                  background: "var(--card)",
                  fontSize: "0.75rem",
                  padding: "0.375rem 0.625rem",
                  boxShadow: "0 12px 30px -14px rgba(27,43,70,0.45)",
                }}
                labelStyle={{ color: "var(--muted)", marginBottom: "0.125rem" }}
                itemStyle={{ color, padding: 0 }}
                labelFormatter={(v) =>
                  new Date(Number(v)).toLocaleString([], { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })
                }
                formatter={(val) => [formatMetricValue({ ...metric, value: Number(val) }), t(METRIC_LABEL_KEY[metric.kind])]}
              />
              <Line type="monotone" dataKey="value" stroke={color} strokeWidth={2} dot={false} activeDot={{ r: 3 }} isAnimationActive={false} connectNulls={false} />
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
        <h2 className="min-w-0 truncate text-lg font-semibold tracking-tight">{room.name}</h2>
        <RangeMenu range={range} onChange={setRange} roomName={room.name} />
      </div>
      {room.comfort && (
        <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-[var(--muted)]">
          <span>{t("comfort.dewPoint")} {Math.round(room.comfort.dewPoint)}°</span>
          <span aria-hidden>·</span>
          <span>{room.comfort.absHumidity.toFixed(1)} g/kg</span>
          <span
            className="rounded-full px-2 py-0.5 font-medium"
            style={{ color: COMFORT_COLOR[room.comfort.status], backgroundColor: COMFORT_BG[room.comfort.status] }}
          >
            {t(STATUS_KEY[room.comfort.status])}
          </span>
        </div>
      )}
      <div className={`mt-3 grid gap-4 ${visible.length >= 2 ? "grid-cols-2" : "grid-cols-1"}`}>
        {visible.map((m) => (
          <MetricChartPanel key={m.kind} metric={m} points={seriesMap[m.kind] ?? []} range={range} />
        ))}
      </div>
    </Card>
  );
}
