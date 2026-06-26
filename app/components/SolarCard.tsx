"use client";
import { useEffect, useRef, useState } from "react";
import {
  Sun, CloudSun, Cloud, CloudFog, CloudRain, CloudLightning, CloudSnow, Moon, CloudMoon,
  ChevronDown, Info, Loader2, type LucideIcon,
} from "lucide-react";
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import type { SolarState, SolarRange, SolarHistoryPoint, SolarHistoryResponse, SolarCostSummary, SkyCondition, ElectricityTariff } from "@/lib/types";
import type { MsgKey } from "@/lib/i18n";
import { Card } from "@/app/components/ui/card";
import { Menu, MenuItem } from "@/app/components/ui/menu";
import { useT } from "@/app/components/LanguageProvider";
import { formatKw, formatKwh, formatPercent, wattsToKw, formatEuro } from "@/lib/metrics";
import { resolveSkyVisual, type SkyIconKey } from "@/lib/sky-visuals";
import { WeatherBackdrop } from "@/app/components/WeatherBackdrop";

const SOLAR_RANGES: SolarRange[] = ["today", "week", "month", "year"];
const RANGE_LABEL_KEY: Record<SolarRange, MsgKey> = {
  today: "solar.range.today",
  week: "solar.range.week",
  month: "solar.range.month",
  year: "solar.range.year",
};

// Chart colours: solar orange line/area on the frosted-white panel; navy axes.
const CHART_STROKE = "#f0913f";
const CHART_GRID = "rgba(27,43,70,0.12)";
const CHART_TICK = "rgba(27,43,70,0.55)";

const SKY_ICON: Record<SkyIconKey, LucideIcon> = {
  sun: Sun, "cloud-sun": CloudSun, cloud: Cloud, "cloud-fog": CloudFog,
  "cloud-rain": CloudRain, "cloud-lightning": CloudLightning, "cloud-snow": CloudSnow,
  moon: Moon, "cloud-moon": CloudMoon,
};
const SKY_LABEL: Record<SkyCondition, MsgKey> = {
  sunny: "weather.sunny", "partly-cloudy": "weather.partlyCloudy", cloudy: "weather.cloudy",
  fog: "weather.fog", rain: "weather.rain", pouring: "weather.pouring",
  snow: "weather.snow", sleet: "weather.sleet", thunder: "weather.thunder", unknown: "weather.unknown",
};

type HistoryState = {
  chartType: "power" | "energy";
  points: SolarHistoryPoint[];
  producedKwh: number | null;
  cost: SolarCostSummary | null;
};
const EMPTY: HistoryState = { chartType: "power", points: [], producedKwh: null, cost: null };
// The hero total, chart and cost/earnings come from /api/solar-history (not the 3s
// /api/state poll), so refresh them on their own interval to keep them live. The
// underlying solar data only moves every ~15 min, so this is comfortably frequent.
const HISTORY_REFRESH_MS = 60_000;

function RangeMenu({ range, onChange }: { range: SolarRange; onChange: (r: SolarRange) => void }) {
  const t = useT();
  return (
    <Menu
      label={t(RANGE_LABEL_KEY[range])}
      className="shrink-0"
      align="right"
      width="w-32"
      triggerClassName="flex items-center gap-1 rounded-full bg-white/15 px-2.5 py-1 text-xs font-medium text-white transition hover:bg-white/25 active:scale-95"
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

// Frosted-white glass tile with dark default text — amber / teal accent values
// stay legible on every weather background.
function Stat({ k, v, color, info, glass }: { k: string; v: string; color?: string; info?: string; glass?: boolean }) {
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

  const containerCls = glass
    ? "relative min-w-0 flex-1 rounded-2xl border border-white/55 bg-white/82 px-2.5 py-2 backdrop-blur-md"
    : "relative min-w-0 flex-1 rounded-2xl bg-foreground/[0.035] px-2.5 py-2";
  const labelCls = glass
    ? "truncate text-[0.66rem] uppercase tracking-wide text-[#1b2b46]/60"
    : "truncate text-[0.66rem] uppercase tracking-wide text-[var(--muted)]";
  const infoBtnCls = glass
    ? "ml-auto shrink-0 text-[#1b2b46]/55 transition hover:text-[#1b2b46] active:scale-90"
    : "ml-auto shrink-0 text-[var(--muted)] transition hover:text-foreground active:scale-90";

  return (
    <div ref={ref} className={containerCls}>
      <div className="flex items-center gap-1">
        <span className={labelCls}>{k}</span>
        {info && (
          <button
            type="button"
            aria-label={`Uitleg: ${k}`}
            onClick={() => setOpen((o) => !o)}
            className={infoBtnCls}
          >
            <Info size={11} aria-hidden />
          </button>
        )}
      </div>
      <div
        className={`mt-0.5 truncate text-[0.95rem] font-bold${glass && !color ? " text-[#1b2b46]" : ""}`}
        style={color ? { color } : undefined}
      >
        {v}
      </div>
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
  // History (chart + produced/cost) loads from a separate endpoint, a beat after the
  // live hero. Show a spinner until the first response for the selected range lands.
  const [histLoading, setHistLoading] = useState(true);
  // Whether a tariff is configured — this, not the per-range cost data, decides the
  // optional cost row. Fetched once; the body waits on it too, so the cost row's slot
  // is reserved up-front and can never pop in after load (which would shift the layout).
  const [hasTariff, setHasTariff] = useState<boolean | null>(null);
  // Flip loading on from the range-change handler (not inside the effect) to keep the
  // fetch effect free of synchronous setState.
  function changeRange(r: SolarRange) {
    setRange(r);
    setHistLoading(true);
  }

  // Dev-only: ?sky=<condition>[-night] previews any weather backdrop. No-op in production.
  const [devSky, setDevSky] = useState<{ condition: SkyCondition; isDay: boolean } | null>(null);
  useEffect(() => {
    if (process.env.NODE_ENV === "production") return;
    const q = new URLSearchParams(window.location.search).get("sky");
    if (!q) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-shot dev-only URL read on mount
    setDevSky({ condition: q.replace(/-(day|night)$/, "") as SkyCondition, isDay: !q.endsWith("-night") });
  }, []);

  // Load on mount + on range change, then keep fresh on an interval so the produced
  // total, chart and cost/earnings track the day live. A failed background refresh
  // keeps the last good data; only the initial load clears to EMPTY (→ hero fallback).
  useEffect(() => {
    let alive = true;
    let first = true;
    async function load() {
      try {
        const r = await fetch(`/api/solar-history?range=${range}`);
        if (!r.ok) throw new Error("bad");
        const d: SolarHistoryResponse = await r.json();
        if (alive) setHist({ chartType: d.chartType, points: d.points ?? [], producedKwh: d.summary?.producedKwh ?? null, cost: d.summary?.cost ?? null });
      } catch {
        if (alive && first) setHist(EMPTY);
      } finally {
        if (alive && first) { setHistLoading(false); first = false; }
      }
    }
    load();
    const timer = setInterval(load, HISTORY_REFRESH_MS);
    return () => { alive = false; clearInterval(timer); };
  }, [range]);

  // Learn once whether any tariff is set, so the cost row's height is reserved before
  // the first reveal rather than appearing afterwards.
  useEffect(() => {
    let alive = true;
    fetch("/api/settings")
      .then((r) => r.json())
      .then((s: { tariff?: ElectricityTariff }) => {
        if (!alive) return;
        const tr = s.tariff;
        setHasTariff(!!tr && (tr.importPrice != null || tr.exportPrice != null || tr.importLow != null || tr.importHigh != null || tr.feedInPrice != null));
      })
      .catch(() => { if (alive) setHasTariff(false); });
    return () => { alive = false; };
  }, []);

  const net = solar.netGridKw;
  const netLabel = solar.gridDirection === "export" ? t("solar.toGrid") : t("solar.fromGrid");
  const netColor = solar.gridDirection === "export" ? "var(--accent-cool)" : "var(--accent-warn)";
  const netValue = net == null ? "—" : `${formatKw(Math.abs(net))} kW`;
  const hasChart = hist.points.some((p) => p.value != null);

  const skyCond = devSky?.condition ?? solar.sky.condition;
  const skyIsDay = devSky?.isDay ?? solar.sky.isDay;
  const sky = resolveSkyVisual(skyCond, skyIsDay, solar.sky.cloudCoverage);
  const SkyIcon = SKY_ICON[sky.icon];
  const skyLabel = !skyIsDay && skyCond === "sunny" ? t("weather.night") : t(SKY_LABEL[skyCond]);
  // Hold the whole body in the loading state until BOTH the history and the tariff
  // flag are known, so the reserved layout already matches the final one.
  const loading = histLoading || hasTariff === null;
  const showCost = hasTariff === true;
  // Parts only animate in once loaded; during loading they're rendered (hidden) so
  // they reserve their final height, then this class kicks off the staggered entrance.
  const riseCls = loading ? "" : "animate-rise";

  // Hero shows the produced total for the selected range. If that total isn't available
  // (history fetch failed / empty buckets) once loading is done, fall back to live power
  // so the headline is never a lone "—" while live data still sits in the stats below.
  const heroHasTotal = loading || hist.producedKwh != null;
  const heroValue = heroHasTotal ? formatKwh(hist.producedKwh) : formatKw(wattsToKw(solar.currentPowerW));
  const heroUnit = heroHasTotal ? "kWh" : "kW";
  // Caption names the hero's scope (produced energy for the selected range) so the kWh
  // total is never confused with the live kW readings below. In the rare fallback to
  // live power, it reads as "Now" instead.
  const heroCaption = heroHasTotal ? `${t("solar.produced")} · ${t(RANGE_LABEL_KEY[range])}` : t("solar.now");

  return (
    <Card
      style={{ background: sky.gradient, borderColor: "transparent" }}
      className="relative overflow-hidden text-white"
      data-sky={sky.key}
      aria-label={`${t("solar.title")} — ${skyLabel}`}
    >
      <WeatherBackdrop visual={sky} />
      {/* Primary weather symbol as a faded top-right watermark — same treatment as the Chill/Thermostat cards. */}
      <SkyIcon size={140} aria-hidden strokeWidth={1.5} className="pointer-events-none absolute -right-6 -top-8 text-white opacity-10" />

      <div className="relative z-10">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2 text-lg font-semibold">
            <SkyIcon size={18} aria-hidden className="shrink-0 text-white" />
            {t("solar.title")}
          </div>
          <RangeMenu range={range} onChange={changeRange} />
        </div>

        {!solar.available ? (
          <div className="mt-4 flex h-36 items-center justify-center text-sm text-white/80">
            {t("solar.unavailable")}
          </div>
        ) : (
        <div className="relative">
          {/* Whole-widget spinner overlay. The real content sits beneath it (hidden),
              so it already reserves its final height — no layout jump when the data
              lands — and the parts then stagger in (animate-rise). */}
          {loading && (
            <div className="absolute inset-0 z-20 flex items-center justify-center" role="status" aria-label={t("app.loading")}>
              <Loader2 size={30} className="animate-spin text-white/85" aria-hidden />
            </div>
          )}
          <div className={loading ? "invisible" : ""} aria-hidden={loading || undefined}>
        {/* Hero = produced total for the selected range, captioned with its scope so it
            never reads as a live value. Live power lives in the NOW group below. */}
        <div className={riseCls} style={{ animationDelay: "0ms" }}>
          <div className="text-[0.7rem] font-semibold uppercase tracking-wide text-white/70">{heroCaption}</div>
          <div className="mt-0.5 font-display text-5xl font-medium leading-none tracking-tight [text-shadow:0_2px_8px_rgba(0,0,0,0.25)]">
            {heroValue}
            <span className="ml-1 text-base font-medium text-white/80">{heroUnit}</span>
          </div>
        </div>

        <div className={`${riseCls} mt-4 rounded-2xl border border-white/55 bg-white/82 p-2 backdrop-blur-md`} style={{ animationDelay: "80ms" }}>
          <div className="h-32">
          {!hasChart ? (
            <div className="flex h-full items-center justify-center text-xs text-[#1b2b46]/60">
              {t("solar.empty")}
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              {hist.chartType === "power" ? (
                <AreaChart data={hist.points} margin={{ top: 6, right: 8, bottom: 0, left: 0 }}>
                  <defs>
                    <linearGradient id="solarFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0" stopColor={CHART_STROKE} stopOpacity={0.28} />
                      <stop offset="1" stopColor={CHART_STROKE} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke={CHART_GRID} strokeDasharray="3 3" vertical={false} />
                  <XAxis
                    dataKey="t" type="number" scale="time" domain={["dataMin", "dataMax"]}
                    tickFormatter={(v) => new Date(Number(v)).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    tick={{ fontSize: 10, fill: CHART_TICK }} tickLine={false} axisLine={false} minTickGap={36}
                  />
                  <YAxis
                    width={40} tickCount={4}
                    tickFormatter={(v) => (Number(v) / 1000).toFixed(1).replace(".", ",")}
                    tick={{ fontSize: 10, fill: CHART_TICK }} tickLine={false} axisLine={false}
                  />
                  <Tooltip
                    contentStyle={{ borderRadius: "0.75rem", border: "1px solid var(--card-border)", background: "var(--card)", color: "var(--foreground)", fontSize: "0.75rem", padding: "0.375rem 0.625rem" }}
                    labelFormatter={(v) => new Date(Number(v)).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    formatter={(val) => [`${(Number(val) / 1000).toFixed(2).replace(".", ",")} kW`, t("solar.now")]}
                  />
                  <Area type="monotone" dataKey="value" stroke={CHART_STROKE} strokeWidth={2} fill="url(#solarFill)" isAnimationActive={false} connectNulls />
                </AreaChart>
              ) : (
                <BarChart data={hist.points} margin={{ top: 6, right: 8, bottom: 0, left: 0 }}>
                  <CartesianGrid stroke={CHART_GRID} strokeDasharray="3 3" vertical={false} />
                  <XAxis
                    dataKey="t" type="category" interval="preserveStartEnd"
                    tickFormatter={(v) => new Date(Number(v)).toLocaleDateString([], { day: "numeric", month: "short" })}
                    tick={{ fontSize: 10, fill: CHART_TICK }} tickLine={false} axisLine={false} minTickGap={24}
                  />
                  <YAxis
                    width={40} tickCount={4}
                    tickFormatter={(v) => String(Math.round(Number(v)))}
                    tick={{ fontSize: 10, fill: CHART_TICK }} tickLine={false} axisLine={false}
                  />
                  <Tooltip
                    contentStyle={{ borderRadius: "0.75rem", border: "1px solid var(--card-border)", background: "var(--card)", color: "var(--foreground)", fontSize: "0.75rem", padding: "0.375rem 0.625rem" }}
                    labelFormatter={(v) => new Date(Number(v)).toLocaleDateString([], { day: "numeric", month: "short" })}
                    formatter={(val) => [`${formatKwh(Number(val))} kWh`, t("solar.title")]}
                  />
                  <Bar dataKey="value" fill="rgba(240,145,63,0.9)" radius={[3, 3, 0, 0]} isAnimationActive={false} />
                </BarChart>
              )}
            </ResponsiveContainer>
          )}
          </div>
        </div>

        {/* Live readings — all instantaneous — grouped under a NOW header. */}
        <div className={`${riseCls} mt-4`} style={{ animationDelay: "160ms" }}>
          <div className="mb-1 text-[0.62rem] font-semibold uppercase tracking-wide text-white/55">{t("solar.now")}</div>
          <div className="flex gap-2">
            <Stat glass k={t("solar.power")} v={`${formatKw(wattsToKw(solar.currentPowerW))} kW`} info={t("solar.nowInfo")} />
            <Stat glass k={netLabel} v={netValue} color={netColor} info={t("solar.netInfo")} />
            <Stat glass k={t("solar.coverage")} v={`${formatPercent(solar.coveragePct)}%`} info={t("solar.coverageInfo")} />
          </div>
        </div>
        {/* Money totals for the selected range — grouped under the range header so it's
            clear they're period totals, not "now" figures. */}
        {showCost && (
          <div className={`${riseCls} mt-3`} style={{ animationDelay: "240ms" }}>
            <div className="mb-1 text-[0.62rem] font-semibold uppercase tracking-wide text-white/55">{t(RANGE_LABEL_KEY[range])}</div>
            <div className="flex gap-2">
              <Stat glass k={t("solar.cost")} v={formatEuro(hist.cost?.importCost ?? null)} />
              <Stat glass k={t("solar.earnings")} v={formatEuro(hist.cost?.exportEarnings ?? null)} color="var(--accent-cool)" />
            </div>
          </div>
        )}
          </div>
        </div>
        )}
      </div>
    </Card>
  );
}
