"use client";
import { useEffect, useRef, useState } from "react";
import type { ThermostatState } from "@/lib/types";

export function ThermostatCard({
  thermostat,
  onAction,
}: {
  thermostat: ThermostatState;
  onAction: (action: string, value: number) => void;
}) {
  const [pending, setPending] = useState<number | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => { setPending(null); }, [thermostat.temp]);

  // Clear any pending debounce timer on unmount.
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const shown = pending ?? thermostat.temp ?? thermostat.min;
  const disabled = !thermostat.available;

  function bump(delta: number) {
    const next = Math.min(thermostat.max, Math.max(thermostat.min, shown + delta * thermostat.step));
    setPending(next);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => onAction("set_temp", next), 400);
  }

  return (
    <section className="rounded-2xl bg-neutral-900 p-5 text-neutral-100" aria-label={thermostat.name}>
      <h2 className="text-center text-lg font-medium">{thermostat.name}</h2>
      <p className="mt-1 text-center text-sm text-neutral-400">
        {thermostat.current != null ? `${thermostat.current.toFixed(1).replace(".", ",")}°C` : "—"}
      </p>
      <div className="mt-3 flex items-center justify-center gap-6">
        <button aria-label="−" disabled={disabled} onClick={() => bump(-1)}
          className="h-12 w-12 rounded-full border border-neutral-700 text-2xl disabled:opacity-40">−</button>
        <span className="text-4xl font-semibold">{shown}°C</span>
        <button aria-label="+" disabled={disabled} onClick={() => bump(1)}
          className="h-12 w-12 rounded-full border border-neutral-700 text-2xl disabled:opacity-40">+</button>
      </div>
    </section>
  );
}
