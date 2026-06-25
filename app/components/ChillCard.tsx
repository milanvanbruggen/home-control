"use client";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { Snowflake, Flame, Power, Minus, Plus, Loader2, Droplet } from "lucide-react";
import type { ChillState } from "@/lib/types";
import { Card } from "@/app/components/ui/card";
import { Badge } from "@/app/components/ui/badge";
import { Button } from "@/app/components/ui/button";
import { useT } from "@/app/components/LanguageProvider";
import type { MsgKey } from "@/lib/i18n";

type Action = (action: string, value: boolean | string | number) => void;

// Quatt reports fan modes in English; show localized labels (low→high) while sending the raw value.
const FAN_KEY: Record<string, MsgKey> = { Low: "fan.low", Normal: "fan.normal", High: "fan.high" };
const FAN_RANK: Record<string, number> = { Low: 0, Normal: 1, High: 2 };

// Quatt actions travel HA → cloud → device (seconds). Give up waiting after this and
// accept whatever state the server reports (Quatt may hold a Chill for capacity).
const PENDING_TIMEOUT = 10_000;

/** Map Quatt's raw status string to a message key (null = unknown → show raw / hide). */
function chillStatusKey(status: string | null): MsgKey | null {
  if (!status) return null;
  const s = status.toLowerCase();
  if (s.includes("working")) return "chill.statusWorking";
  if (s.includes("starting")) return "chill.statusStarting";
  if (s.includes("limit") || s.includes("capacit")) return "chill.statusCapacity";
  if (s.includes("off") || s === "uit") return "common.off";
  return null;
}

const GRADIENT = {
  cool: "linear-gradient(155deg, #3aa6dd, #22b39e)",
  heat: "linear-gradient(155deg, #f0913f, #e85f4c)",
  off: "linear-gradient(155deg, #8a93a6, #6b7280)",
};

export function ChillCard({ chill, onAction }: { chill: ChillState; onAction: Action }) {
  const [pendingTemp, setPendingTemp] = useState<number | null>(null);
  const [pendingMode, setPendingMode] = useState<"cool" | "heat" | null>(null);
  const [pendingFan, setPendingFan] = useState<string | null>(null);
  const [pendingPower, setPendingPower] = useState<boolean | null>(null);
  const t = useT();

  const tempTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const modeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fanTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const powerTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Reset optimistic temp when the server-confirmed value arrives.
  useEffect(() => { setPendingTemp(null); }, [chill.temp]);

  // Clear each pending control once the incoming server state confirms the request.
  useEffect(() => {
    if (pendingMode != null && chill.on && chill.mode === pendingMode) {
      setPendingMode(null);
      if (modeTimer.current) clearTimeout(modeTimer.current);
    }
  }, [chill.on, chill.mode, pendingMode]);
  useEffect(() => {
    if (pendingFan != null && chill.fan === pendingFan) {
      setPendingFan(null);
      if (fanTimer.current) clearTimeout(fanTimer.current);
    }
  }, [chill.fan, pendingFan]);
  useEffect(() => {
    if (pendingPower != null && chill.on === pendingPower) {
      setPendingPower(null);
      if (powerTimer.current) clearTimeout(powerTimer.current);
    }
  }, [chill.on, pendingPower]);

  // Clear every timer on unmount.
  useEffect(
    () => () => {
      [tempTimer, modeTimer, fanTimer, powerTimer].forEach((t) => t.current && clearTimeout(t.current));
    },
    [],
  );

  const shown = pendingTemp ?? chill.temp ?? chill.min;

  function bumpTemp(delta: number) {
    const next = Math.min(chill.max, Math.max(chill.min, shown + delta * chill.step));
    setPendingTemp(next);
    if (tempTimer.current) clearTimeout(tempTimer.current);
    tempTimer.current = setTimeout(() => onAction("set_temp", next), 400);
  }

  function tapMode(m: "cool" | "heat") {
    setPendingMode(m);
    onAction("set_mode", m);
    if (modeTimer.current) clearTimeout(modeTimer.current);
    modeTimer.current = setTimeout(() => setPendingMode(null), PENDING_TIMEOUT);
  }
  function tapFan(f: string) {
    setPendingFan(f);
    onAction("set_fan", f);
    if (fanTimer.current) clearTimeout(fanTimer.current);
    fanTimer.current = setTimeout(() => setPendingFan(null), PENDING_TIMEOUT);
  }
  function tapPower() {
    const next = !(pendingPower ?? chill.on);
    setPendingPower(next);
    onAction("on_off", next);
    if (powerTimer.current) clearTimeout(powerTimer.current);
    powerTimer.current = setTimeout(() => setPendingPower(null), PENDING_TIMEOUT);
  }

  const baseDisabled = !chill.available;
  const atMin = shown <= chill.min;
  const atMax = shown >= chill.max;

  // Effective (optimistic) state — reflects a pending request immediately.
  const effectiveOn = pendingPower ?? chill.on;
  const effectiveMode = pendingMode ?? chill.mode;
  const effectiveFan = pendingFan ?? chill.fan;

  const modeDisabled = baseDisabled || pendingMode != null || pendingPower != null;
  const fanDisabled = baseDisabled || pendingFan != null;
  const powerDisabled = baseDisabled || pendingPower != null || pendingMode != null;

  const gradient = !effectiveOn ? GRADIENT.off : effectiveMode === "heat" ? GRADIENT.heat : GRADIENT.cool;
  const WatermarkIcon = effectiveMode === "heat" ? Flame : Snowflake;

  // Only the background differs from the shared Card — radius, padding, border
  // and shadow stay the Card defaults so every section aligns into one stack.
  const cardStyle: CSSProperties = { background: gradient };

  const statusKey = chillStatusKey(chill.status);
  const statusLabel = statusKey ? t(statusKey) : chill.status;
  const statusTone = statusKey === "chill.statusCapacity" || statusKey === "chill.statusStarting" ? "warn" : "neutral";

  // Order known fan modes low→high; keep unknown values in their original order.
  const fans = chill.fanOptions
    .map((raw, idx) => ({ raw, key: raw in FAN_RANK ? FAN_RANK[raw] : 1000 + idx }))
    .sort((a, b) => a.key - b.key);

  // When off, HA forgets the cool/heat selection — fall back to the last-known
  // mode so the selector still shows which mode the Chill was in.
  const shownMode = effectiveMode === "cool" || effectiveMode === "heat" ? effectiveMode : chill.lastMode;
  const modeHighlightShown = shownMode === "cool" || shownMode === "heat";
  const activeFanIndex = fans.findIndex((f) => f.raw === effectiveFan);

  // Shared classes for a segment label sitting above the sliding highlight.
  const segBase =
    "relative z-10 flex min-h-[44px] flex-1 items-center justify-center gap-1.5 rounded-full py-2.5 text-sm font-medium transition active:scale-[0.98] disabled:opacity-50";
  const segText = (active: boolean) => `${segBase} ${active ? "text-[#1b2b46]" : "text-white/85"}`;
  // Mode label: dark text on the bright highlight when powered on; a lighter
  // "selected but off" white when off (the highlight is dimmed below).
  const modeText = (m: "cool" | "heat") =>
    `${segBase} ${shownMode === m ? (effectiveOn ? "text-[#1b2b46]" : "text-white") : "text-white/85"}`;
  const highlight = "absolute left-1 top-1 bottom-1 rounded-full shadow-sm transition-transform duration-200 ease-out";

  return (
    <Card aria-label={chill.name} style={cardStyle} className="relative overflow-hidden text-white">
      <WatermarkIcon
        size={150}
        aria-hidden
        className="pointer-events-none absolute -right-6 -top-8 text-white/10"
        strokeWidth={1.5}
      />

      <div className="relative flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">{chill.name}</h2>
          <p className="mt-0.5 flex items-center gap-1.5 text-sm text-white/80">
            {effectiveMode === "heat" ? <Flame size={14} aria-hidden /> : <Snowflake size={14} aria-hidden />}
            <span>{chill.current != null ? `${chill.current.toFixed(1).replace(".", ",")}°C` : "—"}</span>
            <span className="text-xs text-white/60">{t("climate.now")}</span>
          </p>
        </div>
        {statusLabel && <Badge tone={statusTone}>{statusLabel}</Badge>}
      </div>

      {chill.waterWarning && (
        <div
          role="status"
          className="relative mt-3 flex items-center gap-2.5 rounded-xl bg-white px-3.5 py-2.5 text-sm font-semibold text-[#c2410c] shadow-md ring-1 ring-black/5"
        >
          <Droplet size={18} aria-hidden className="shrink-0" />
          <span>{t("chill.water")}</span>
        </div>
      )}

      <div className="relative mt-5 flex items-center justify-center gap-7">
        <Button aria-label="−" variant="control" size="icon" disabled={baseDisabled || atMin} onClick={() => bumpTemp(-1)}>
          <Minus size={22} aria-hidden />
        </Button>
        <span className="font-display text-6xl font-semibold leading-none tabular-nums text-white">
          {shown}°C
        </span>
        <Button aria-label="+" variant="control" size="icon" disabled={baseDisabled || atMax} onClick={() => bumpTemp(1)}>
          <Plus size={22} aria-hidden />
        </Button>
      </div>

      {pendingTemp != null && (
        <p className="relative mt-2 flex items-center justify-center gap-1.5 text-xs text-white/70">
          <Loader2 size={12} className="animate-spin" aria-hidden /> {t("climate.saving")}
        </p>
      )}

      <div className="relative mt-6 flex items-center gap-3">
        {/* Mode: sliding-highlight segmented control */}
        <div className="relative flex flex-1 rounded-full bg-white/15 p-1">
          {modeHighlightShown && (
            <span
              aria-hidden
              className={`${highlight} ${effectiveOn ? "bg-white" : "bg-white/25"}`}
              style={{ width: "calc((100% - 0.5rem) / 2)", transform: `translateX(${shownMode === "heat" ? "100%" : "0%"})` }}
            />
          )}
          <button
            type="button" disabled={modeDisabled} onClick={() => tapMode("cool")}
            aria-pressed={shownMode === "cool"}
            className={modeText("cool")}
          >
            {pendingMode === "cool" ? <Loader2 size={15} className="animate-spin" aria-hidden /> : <Snowflake size={15} aria-hidden />}
            {t("chill.cool")}
          </button>
          <button
            type="button" disabled={modeDisabled} onClick={() => tapMode("heat")}
            aria-pressed={shownMode === "heat"}
            className={modeText("heat")}
          >
            {pendingMode === "heat" ? <Loader2 size={15} className="animate-spin" aria-hidden /> : <Flame size={15} aria-hidden />}
            {t("chill.heat")}
          </button>
        </div>
        <button
          type="button" aria-label={t("climate.power")} disabled={powerDisabled} onClick={tapPower}
          className={`flex h-[3.25rem] w-[3.25rem] shrink-0 items-center justify-center rounded-full border transition active:scale-95 disabled:opacity-50 ${
            effectiveOn ? "border-transparent bg-white text-[#1b2b46]" : "border-white/30 bg-white/10 text-white"
          }`}
        >
          {pendingPower != null ? <Loader2 size={20} className="animate-spin" aria-hidden /> : <Power size={20} aria-hidden />}
        </button>
      </div>

      {/* Fan: sliding-highlight segmented control */}
      <div className="relative mt-3 flex rounded-full bg-white/15 p-1">
        {activeFanIndex >= 0 && (
          <span
            aria-hidden
            className={highlight}
            style={{ width: `calc((100% - 0.5rem) / ${fans.length})`, transform: `translateX(${activeFanIndex * 100}%)` }}
          />
        )}
        {fans.map(({ raw }) => (
          <button
            key={raw} type="button" disabled={fanDisabled} onClick={() => tapFan(raw)}
            aria-pressed={effectiveFan === raw}
            className={segText(effectiveFan === raw)}
          >
            {pendingFan === raw && <Loader2 size={13} className="animate-spin" aria-hidden />}
            {FAN_KEY[raw] ? t(FAN_KEY[raw]) : raw}
          </button>
        ))}
      </div>
    </Card>
  );
}
