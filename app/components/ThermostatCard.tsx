"use client";
import { useEffect, useRef, useState } from "react";
import { Flame, Snowflake, Thermometer, Power, Minus, Plus, Loader2, BatteryFull, BatteryWarning, AlertTriangle, type LucideIcon } from "lucide-react";
import type { ThermostatState } from "@/lib/types";
import { Card } from "@/app/components/ui/card";
import { Badge } from "@/app/components/ui/badge";
import { Button } from "@/app/components/ui/button";
import { useT } from "@/app/components/LanguageProvider";
import type { MsgKey } from "@/lib/i18n";

type Action = (action: string, value: boolean | string | number) => void;

// Tado actions can take a moment; give up the optimistic state after this.
const PENDING_TIMEOUT = 10_000;

const STATUS_KEY: Record<ThermostatState["status"], MsgKey> = {
  heating: "thermostat.heating",
  cooling: "thermostat.cooling",
  idle: "thermostat.idle",
  off: "common.off",
};
const STATUS_ICON: Record<ThermostatState["status"], LucideIcon> = {
  heating: Flame,
  cooling: Snowflake,
  idle: Thermometer,
  off: Power,
};
const GRADIENT: Record<ThermostatState["status"], string> = {
  heating: "linear-gradient(155deg, #f0913f, #e0703a)",
  cooling: "linear-gradient(155deg, #3aa6dd, #22b39e)",
  idle: "linear-gradient(155deg, #8a93a6, #6b7280)",
  off: "linear-gradient(155deg, #8a93a6, #6b7280)",
};

/** One decimal, comma-formatted (NL), so 0.5° steps don't drift on floating point. */
function fmt(n: number | null): string {
  return n != null ? `${(Math.round(n * 10) / 10).toFixed(1).replace(".", ",")}°C` : "—";
}

export function ThermostatCard({ thermostat, onAction }: { thermostat: ThermostatState; onAction: Action }) {
  const [pending, setPending] = useState<number | null>(null);
  const [pendingPower, setPendingPower] = useState<boolean | null>(null);
  const t = useT();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const powerTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Drop the optimistic setpoint once the server-confirmed value arrives.
  useEffect(() => { setPending(null); }, [thermostat.setpoint]);
  // Drop the optimistic power once the server-confirmed on/off matches.
  useEffect(() => {
    if (pendingPower != null && (thermostat.status !== "off") === pendingPower) {
      setPendingPower(null);
      if (powerTimer.current) clearTimeout(powerTimer.current);
    }
  }, [thermostat.status, pendingPower]);
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
    if (powerTimer.current) clearTimeout(powerTimer.current);
  }, []);

  // Effective (optimistic) on/off + status.
  const on = pendingPower ?? thermostat.status !== "off";
  const effectiveStatus: ThermostatState["status"] =
    pendingPower == null
      ? thermostat.status
      : pendingPower
        ? thermostat.status === "off" ? "idle" : thermostat.status
        : "off";

  const shown = pending ?? thermostat.setpoint ?? thermostat.min;
  const baseDisabled = !thermostat.available;
  const atMin = shown <= thermostat.min;
  const atMax = shown >= thermostat.max;
  const powerDisabled = baseDisabled || pendingPower != null;
  const Icon = STATUS_ICON[effectiveStatus];

  function bump(delta: number) {
    const next = Math.round(Math.min(thermostat.max, Math.max(thermostat.min, shown + delta * thermostat.step)) * 10) / 10;
    setPending(next);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => onAction("set_temp", next), 400);
  }

  function tapPower() {
    const next = !on;
    setPendingPower(next);
    onAction("on_off", next);
    if (powerTimer.current) clearTimeout(powerTimer.current);
    powerTimer.current = setTimeout(() => setPendingPower(null), PENDING_TIMEOUT);
  }

  return (
    <Card
      aria-label={thermostat.name}
      style={{ background: GRADIENT[effectiveStatus], borderColor: "transparent" }}
      className="relative overflow-hidden text-white"
    >
      <Icon size={140} aria-hidden className="pointer-events-none absolute -right-5 -top-7 text-white opacity-10" strokeWidth={1.5} />

      <div className="relative flex items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-1.5 text-lg font-semibold tracking-tight">
            {thermostat.name}
            {thermostat.batteryLow != null && (
              thermostat.batteryLow
                ? <BatteryWarning size={15} aria-label={t("thermostat.batteryLow")} className="text-[#e85f4c]" />
                : <BatteryFull size={15} aria-label={t("thermostat.batteryOk")} className="text-[var(--muted)]" />
            )}
          </h2>
          {thermostat.valvesLow > 0 && (
            <div className="mt-1 flex items-center gap-1 text-xs text-[var(--accent-warn)]">
              <AlertTriangle size={12} aria-hidden />
              {thermostat.valvesLow === 1
                ? t("thermostat.valveLowOne")
                : t("thermostat.valveLowMany", { count: thermostat.valvesLow })}
            </div>
          )}
          <p className="mt-0.5 flex items-center gap-1.5 text-sm text-white/80">
            <Icon size={14} aria-hidden />
            <span>{fmt(thermostat.current)}</span>
            <span className="text-xs text-white/60">{t("climate.now")}</span>
          </p>
        </div>
        <Badge>{t(STATUS_KEY[effectiveStatus])}</Badge>
      </div>

      {on && (
        <>
          <div className="relative mt-5 flex items-center justify-center gap-7">
            <Button aria-label="−" variant="control" size="icon" disabled={baseDisabled || atMin} onClick={() => bump(-1)}>
              <Minus size={22} aria-hidden />
            </Button>
            <span className="font-display text-6xl font-semibold leading-none tabular-nums text-white">
              {fmt(shown)}
            </span>
            <Button aria-label="+" variant="control" size="icon" disabled={baseDisabled || atMax} onClick={() => bump(1)}>
              <Plus size={22} aria-hidden />
            </Button>
          </div>
          {pending != null && (
            <p className="relative mt-2 flex items-center justify-center gap-1.5 text-xs text-white/70">
              <Loader2 size={12} className="animate-spin" aria-hidden /> {t("climate.saving")}
            </p>
          )}
        </>
      )}

      {/* On/off — same round power button as the Chill cards. Tighter gap when off keeps the card compact. */}
      <div className={`relative flex justify-center ${on ? "mt-6" : "mt-4"}`}>
        <button
          type="button"
          aria-label={t("climate.power")}
          aria-pressed={on}
          disabled={powerDisabled}
          onClick={tapPower}
          className={`flex h-[3.25rem] w-[3.25rem] shrink-0 items-center justify-center rounded-full border transition active:scale-95 disabled:opacity-50 ${
            on ? "border-transparent bg-white text-[#1b2b46]" : "border-white/30 bg-white/10 text-white"
          }`}
        >
          {pendingPower != null ? <Loader2 size={20} className="animate-spin" aria-hidden /> : <Power size={20} aria-hidden />}
        </button>
      </div>
    </Card>
  );
}
