"use client";
import { useEffect, useRef, useState } from "react";
import { Flame, Snowflake, Thermometer, Power, Minus, Plus, Loader2, type LucideIcon } from "lucide-react";
import type { ThermostatState } from "@/lib/types";
import { Card } from "@/app/components/ui/card";
import { Badge } from "@/app/components/ui/badge";
import { Button } from "@/app/components/ui/button";

type Action = (action: string, value: boolean | string | number) => void;

const STATUS_LABEL: Record<ThermostatState["status"], string> = {
  heating: "Verwarmt",
  cooling: "Koelt",
  idle: "Inactief",
  off: "Uit",
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
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Drop the optimistic setpoint once the server-confirmed value arrives.
  useEffect(() => { setPending(null); }, [thermostat.setpoint]);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const shown = pending ?? thermostat.setpoint ?? thermostat.min;
  const disabled = !thermostat.available;
  const atMin = shown <= thermostat.min;
  const atMax = shown >= thermostat.max;
  const Icon = STATUS_ICON[thermostat.status];
  // When the thermostat is off, the setpoint Tado reports (~5°) is just the
  // frost-protection value — show "Uit" until the user picks a temperature.
  const isOff = thermostat.status === "off" && pending == null;

  function bump(delta: number) {
    const next = Math.round(Math.min(thermostat.max, Math.max(thermostat.min, shown + delta * thermostat.step)) * 10) / 10;
    setPending(next);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => onAction("set_temp", next), 400);
  }

  return (
    <Card
      aria-label={thermostat.name}
      style={{ background: GRADIENT[thermostat.status] }}
      className="relative overflow-hidden text-white"
    >
      <Icon size={140} aria-hidden className="pointer-events-none absolute -right-5 -top-7 text-white/10" strokeWidth={1.5} />

      <div className="relative flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">{thermostat.name}</h2>
          <p className="mt-0.5 flex items-center gap-1.5 text-sm text-white/80">
            <Icon size={14} aria-hidden />
            <span>{fmt(thermostat.current)}</span>
            <span className="text-xs text-white/60">nu</span>
          </p>
        </div>
        <Badge>
          <Icon size={12} aria-hidden /> {STATUS_LABEL[thermostat.status]}
        </Badge>
      </div>

      <div className="relative mt-5 flex items-center justify-center gap-7">
        <Button aria-label="−" variant="control" size="icon" disabled={disabled || atMin} onClick={() => bump(-1)}>
          <Minus size={22} aria-hidden />
        </Button>
        <span className="font-display text-6xl font-semibold leading-none tabular-nums text-white">
          {isOff ? "Uit" : fmt(shown)}
        </span>
        <Button aria-label="+" variant="control" size="icon" disabled={disabled || atMax} onClick={() => bump(1)}>
          <Plus size={22} aria-hidden />
        </Button>
      </div>

      {pending != null && (
        <p className="relative mt-2 flex items-center justify-center gap-1.5 text-xs text-white/70">
          <Loader2 size={12} className="animate-spin" aria-hidden /> Opslaan…
        </p>
      )}
    </Card>
  );
}
