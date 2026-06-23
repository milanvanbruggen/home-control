"use client";
import { Flame, Snowflake, Thermometer, type LucideIcon } from "lucide-react";
import type { ThermostatState } from "@/lib/types";
import { Card } from "@/app/components/ui/card";
import { Badge } from "@/app/components/ui/badge";

const STATUS_LABEL: Record<ThermostatState["status"], string> = {
  heating: "Verwarmt",
  cooling: "Koelt",
  idle: "Inactief",
};
const STATUS_ICON: Record<ThermostatState["status"], LucideIcon> = {
  heating: Flame,
  cooling: Snowflake,
  idle: Thermometer,
};
const GRADIENT: Record<ThermostatState["status"], string> = {
  heating: "linear-gradient(155deg, #f0913f, #e0703a)",
  cooling: "linear-gradient(155deg, #3aa6dd, #22b39e)",
  idle: "linear-gradient(155deg, #8a93a6, #6b7280)",
};

function fmt(n: number | null): string {
  return n != null ? `${n.toFixed(1).replace(".", ",")}°C` : "—";
}

/** Read-only: the Quatt thermostat cannot be set via Home Assistant, only read. */
export function ThermostatCard({ thermostat }: { thermostat: ThermostatState }) {
  const Icon = STATUS_ICON[thermostat.status];
  return (
    <Card
      aria-label={thermostat.name}
      style={{ background: GRADIENT[thermostat.status], border: "none", boxShadow: "0 26px 60px -34px rgba(0,0,0,0.5)" }}
      className="relative overflow-hidden text-white"
    >
      <Icon size={140} aria-hidden className="pointer-events-none absolute -right-5 -top-7 text-white/10" strokeWidth={1.5} />
      <div className="relative flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">{thermostat.name}</h2>
          <p className="mt-0.5 text-sm text-white/80">Kamertemperatuur</p>
        </div>
        <Badge>
          <Icon size={12} aria-hidden /> {STATUS_LABEL[thermostat.status]}
        </Badge>
      </div>
      <p className="relative mt-4 font-display text-5xl font-semibold leading-none tabular-nums text-white">
        {fmt(thermostat.current)}
      </p>
      <p className="relative mt-3 text-sm text-white/80">Ingesteld: {fmt(thermostat.setpoint)}</p>
    </Card>
  );
}
