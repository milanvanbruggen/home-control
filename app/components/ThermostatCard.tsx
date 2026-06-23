"use client";
import { Flame, Snowflake, Minus as MinusIcon } from "lucide-react";
import type { ThermostatState } from "@/lib/types";
import { Card } from "@/app/components/ui/card";
import { Badge } from "@/app/components/ui/badge";

const STATUS_LABEL: Record<ThermostatState["status"], string> = {
  heating: "Verwarmt",
  cooling: "Koelt",
  idle: "Inactief",
};
const STATUS_TONE: Record<ThermostatState["status"], "heat" | "cool" | "neutral"> = {
  heating: "heat",
  cooling: "cool",
  idle: "neutral",
};

function fmt(n: number | null): string {
  return n != null ? `${n.toFixed(1).replace(".", ",")}°C` : "—";
}

/** Read-only: the Quatt thermostat cannot be set via Home Assistant, only read. */
export function ThermostatCard({ thermostat }: { thermostat: ThermostatState }) {
  const Icon = thermostat.status === "heating" ? Flame : thermostat.status === "cooling" ? Snowflake : MinusIcon;
  return (
    <Card aria-label={thermostat.name}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-medium tracking-tight">{thermostat.name}</h2>
          <p className="mt-0.5 text-sm text-[var(--muted)]">Kamertemperatuur</p>
        </div>
        <Badge tone={STATUS_TONE[thermostat.status]}>
          <Icon size={12} aria-hidden /> {STATUS_LABEL[thermostat.status]}
        </Badge>
      </div>
      <p className="mt-4 font-display text-5xl font-medium leading-none tabular-nums">{fmt(thermostat.current)}</p>
      <p className="mt-3 text-sm text-[var(--muted)]">Ingesteld: {fmt(thermostat.setpoint)}</p>
    </Card>
  );
}
