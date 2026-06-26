"use client";
import { useEffect, useRef, useState } from "react";
import { Sun, ChevronDown, Info } from "lucide-react";
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import type { SolarState, SolarRange, SolarHistoryPoint, SolarHistoryResponse, SolarCostSummary } from "@/lib/types";
import type { MsgKey } from "@/lib/i18n";
import { Card } from "@/app/components/ui/card";
import { Menu, MenuItem } from "@/app/components/ui/menu";
import { useT } from "@/app/components/LanguageProvider";
import { formatKw, formatKwh, formatPercent, wattsToKw, formatEuro } from "@/lib/metrics";

const SOLAR_RANGES: SolarRange[] = ["today", "week", "month", "year"];
const RANGE_LABEL_KEY: Record<SolarRange, MsgKey> = {
  today: "solar.range.today",
  week: "solar.range.week",
  month: "solar.range.month",
  year: "solar.range.year",
};
const SOLAR_COLOR = "#f0913f";

type HistoryState = {
  chartType: "power" | "energy";
  points: SolarHistoryPoint[];
  producedKwh: number | null;
  cost: SolarCostSummary | null;
};
const EMPTY: HistoryState = { chartType: "power", points: [], producedKwh: null, cost: null };

function RangeMenu({ range, onChange }: { range: SolarRange; onChange: (r: SolarRange) => void }) {
  const t = useT();
  return (
    <Menu
      label={t(RANGE_LABEL_KEY[range])}
      className="shrink-0"
      align="right"
      width="w-32"
      triggerClassName="flex items-center gap-1 rounded-full bg-foreground/[0.06] px-2.5 py-1 text-xs font-medium text-[var(--muted)] transition hover:bg-foreground/10 active:scale-95"
      trigger={<>{t(RANGE_LABEL_KEY[range])}<ChevronDown size={13} aria-hidden /></>}
    >
      {(close) =>
        SOLAR_RANGES.map((r) => (
          <MenuItem key={r} selected={r === range} onSelect={() => { onChange(r); close(); }}>
            {t(RANGE_LABEL_KEY[r])}
          </MenuItem>
        ))
      }
    </Menu>
  );
}

function Stat({ k, v, color, info }: { k: string; v: string; color?: string; info?: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative min-w-0 flex-1 rounded-2xl bg-foreground/[0.035] px-2.5 py-2">
      <div className="flex items-center gap-1">
        <span className="truncate text-[0.66rem] uppercase tracking-wide text-[var(--muted)]">{k}</span>
        {info && (
          <button
            type="button"
            aria-label={`Uitleg: ${k}`}
            onClick={() => setOpen((o) => !o)}
            className="ml-auto shrink-0 text-[var(--muted)] transition hover:text-foreground active:scale-90"
          >
            <Info size={11} aria-hidden />
          </button>
        )}
      </div>
      <div className="mt-0.5 truncate text-[0.95rem] font-bold" style={color ? { color } : undefined}>{v}</div>
      {info && open && (
        <div
          role="tooltip"
          className="absolute bottom-full left-0 z-10 mb-1 max-w-[12rem] rounded-xl border border-[var(--card-border)] bg-[var(--card)] px-2.5 py-1.5 text-xs font-normal normal-case text-foreground shadow-lg"
        >
          {info}
        </div>
      )}
    </div>
  );
}

export function SolarCard({ solar }: { solar: SolarState }) {
  const t = useT();
  const [range, setRange] = useState<SolarRange>("today");
  const [hist, setHist] = useState<HistoryState>(EMPTY);

  useEffect(() => {
    let alive = true;
    fetch(`/api/solar-history?range=${range}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("bad"))))
      .then((d: SolarHistoryResponse) => {
        if (!alive) return;
        setHist({ chartType: d.chartType, points: d.points ?? [], producedKwh: d.summary?.producedKwh ?? null, cost: d.summary?.cost ?? null });
      })
      .catch(() => { if (alive) setHist(EMPTY); });
    return () => { alive = false; };
  }, [range]);

  const net = solar.netGridKw;
  const netLabel = solar.gridDirection === "export" ? t("solar.toGrid") : t("solar.fromGrid");
  const netColor = solar.gridDirection === "export" ? "var(--accent-cool)" : "var(--accent-warn)";
  const netValue = net == null ? "—" : `${formatKw(Math.abs(net))} kW`;
  const hasChart = hist.points.some((p) => p.value != null);

  return (
    <Card>
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2 text-lg font-semibold">
          <Sun size={18} aria-hidden style={{ color: "var(--accent-heat)" }} className="shrink-0" />
          {t("solar.title")}
        </div>
        <RangeMenu range={range} onChange={setRange} />
      </div>

      {!solar.available ? (
        <div className="mt-4 flex h-36 items-center justify-center text-sm text-[var(--muted)]">
          {t("solar.unavailable")}
        </div>
      ) : (
      <>
      <div className="font-display text-5xl font-medium leading-none tracking-tight">
        {formatKw(wattsToKw(solar.currentPowerW))}
        <span className="ml-1 text-base font-medium text-[var(--muted)]">kW</span>
      </div>

      <div className="mt-4 h-36">
        {!hasChart ? (
          <div className="flex h-full items-center justify-center text-xs text-[var(--muted)]">
            {t("solar.empty")}
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            {hist.chartType === "power" ? (
              <AreaChart data={hist.points} margin={{ top: 6, right: 8, bottom: 0, left: 0 }}>
                <defs>
                  <linearGradient id="solarFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0" stopColor={SOLAR_COLOR} stopOpacity={0.35} />
                    <stop offset="1" stopColor={SOLAR_COLOR} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="var(--card-border)" strokeDasharray="3 3" vertical={false} />
                <XAxis
                  dataKey="t" type="number" scale="time" domain={["dataMin", "dataMax"]}
                  tickFormatter={(v) => new Date(Number(v)).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  tick={{ fontSize: 10, fill: "var(--muted)" }} tickLine={false} axisLine={false} minTickGap={36}
                />
                <YAxis
                  width={40} tickCount={4}
                  tickFormatter={(v) => (Number(v) / 1000).toFixed(1).replace(".", ",")}
                  tick={{ fontSize: 10, fill: "var(--muted)" }} tickLine={false} axisLine={false}
                />
                <Tooltip
                  contentStyle={{ borderRadius: "0.75rem", border: "1px solid var(--card-border)", background: "var(--card)", fontSize: "0.75rem", padding: "0.375rem 0.625rem" }}
                  labelFormatter={(v) => new Date(Number(v)).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  formatter={(val) => [`${(Number(val) / 1000).toFixed(2).replace(".", ",")} kW`, t("solar.now")]}
                />
                <Area type="monotone" dataKey="value" stroke={SOLAR_COLOR} strokeWidth={2} fill="url(#solarFill)" isAnimationActive={false} connectNulls />
              </AreaChart>
            ) : (
              <BarChart data={hist.points} margin={{ top: 6, right: 8, bottom: 0, left: 0 }}>
                <CartesianGrid stroke="var(--card-border)" strokeDasharray="3 3" vertical={false} />
                <XAxis
                  dataKey="t" type="category" interval="preserveStartEnd"
                  tickFormatter={(v) => new Date(Number(v)).toLocaleDateString([], { day: "numeric", month: "short" })}
                  tick={{ fontSize: 10, fill: "var(--muted)" }} tickLine={false} axisLine={false} minTickGap={24}
                />
                <YAxis
                  width={40} tickCount={4}
                  tickFormatter={(v) => String(Math.round(Number(v)))}
                  tick={{ fontSize: 10, fill: "var(--muted)" }} tickLine={false} axisLine={false}
                />
                <Tooltip
                  contentStyle={{ borderRadius: "0.75rem", border: "1px solid var(--card-border)", background: "var(--card)", fontSize: "0.75rem", padding: "0.375rem 0.625rem" }}
                  labelFormatter={(v) => new Date(Number(v)).toLocaleDateString([], { day: "numeric", month: "short" })}
                  formatter={(val) => [`${formatKwh(Number(val))} kWh`, t("solar.title")]}
                />
                <Bar dataKey="value" fill={SOLAR_COLOR} radius={[3, 3, 0, 0]} isAnimationActive={false} />
              </BarChart>
            )}
          </ResponsiveContainer>
        )}
      </div>

      <div className="mt-4 flex gap-2">
        <Stat k={t(RANGE_LABEL_KEY[range])} v={`${formatKwh(hist.producedKwh)} kWh`} />
        <Stat k={netLabel} v={netValue} color={netColor} />
        <Stat k={t("solar.coverage")} v={`${formatPercent(solar.coveragePct)}%`} info={t("solar.coverageInfo")} />
      </div>
      {hist.cost && (hist.cost.importCost != null || hist.cost.exportEarnings != null) && (
        <div className="mt-2 flex gap-2">
          <Stat k={t("solar.cost")} v={formatEuro(hist.cost.importCost)} />
          <Stat k={t("solar.earnings")} v={formatEuro(hist.cost.exportEarnings)} color="var(--accent-cool)" />
        </div>
      )}
      </>
      )}
    </Card>
  );
}
