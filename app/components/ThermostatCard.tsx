"use client";
import type { ThermostatState } from "@/lib/types";

const STATUS_LABEL: Record<ThermostatState["status"], string> = {
  heating: "Verwarmt",
  cooling: "Koelt",
  idle: "Inactief",
};

function fmt(n: number | null): string {
  return n != null ? `${n.toFixed(1).replace(".", ",")}°C` : "—";
}

/** Read-only: the Quatt thermostat cannot be set via Home Assistant, only read. */
export function ThermostatCard({ thermostat }: { thermostat: ThermostatState }) {
  return (
    <section className="rounded-2xl bg-neutral-900 p-5 text-neutral-100" aria-label={thermostat.name}>
      <h2 className="text-center text-lg font-medium">{thermostat.name}</h2>
      <p className="mt-3 text-center text-4xl font-semibold">{fmt(thermostat.current)}</p>
      <p className="mt-2 text-center text-sm text-neutral-400">Ingesteld: {fmt(thermostat.setpoint)}</p>
      <p className="mt-1 text-center text-sm text-neutral-400">{STATUS_LABEL[thermostat.status]}</p>
    </section>
  );
}
