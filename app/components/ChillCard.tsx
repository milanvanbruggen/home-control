"use client";
import { useEffect, useRef, useState } from "react";
import type { ChillState } from "@/lib/types";

type Action = (action: string, value: boolean | string | number) => void;

export function ChillCard({ chill, onAction }: { chill: ChillState; onAction: Action }) {
  const [pendingTemp, setPendingTemp] = useState<number | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Reset optimistic temp when the server-confirmed value arrives.
  useEffect(() => { setPendingTemp(null); }, [chill.temp]);

  const shown = pendingTemp ?? chill.temp ?? chill.min;

  function bumpTemp(delta: number) {
    const next = Math.min(chill.max, Math.max(chill.min, shown + delta * chill.step));
    setPendingTemp(next);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => onAction("set_temp", next), 400);
  }

  const disabled = !chill.available;

  return (
    <section className="rounded-2xl bg-neutral-900 p-5 text-neutral-100" aria-label={chill.name}>
      <h2 className="text-center text-lg font-medium">{chill.name}</h2>
      <p className="mt-1 text-center text-sm text-neutral-400">
        {chill.mode === "heat" ? "♨" : "❄"} {chill.current != null ? `${chill.current.toFixed(1).replace(".", ",")}°C` : "—"}
      </p>

      <div className="mt-3 flex items-center justify-center gap-6">
        <button aria-label="−" disabled={disabled} onClick={() => bumpTemp(-1)}
          className="h-12 w-12 rounded-full border border-neutral-700 text-2xl disabled:opacity-40">−</button>
        <span className="text-4xl font-semibold">{shown}°C</span>
        <button aria-label="+" disabled={disabled} onClick={() => bumpTemp(1)}
          className="h-12 w-12 rounded-full border border-neutral-700 text-2xl disabled:opacity-40">+</button>
      </div>

      <div className="mt-4 flex items-center gap-3">
        <div className="flex flex-1 rounded-full bg-neutral-800 p-1">
          <button disabled={disabled} onClick={() => onAction("set_mode", "cool")}
            aria-pressed={chill.on && chill.mode === "cool"}
            className={`flex-1 rounded-full py-2 text-sm ${chill.on && chill.mode === "cool" ? "bg-white text-black" : ""}`}>
            ❄ Koelen
          </button>
          <button disabled={disabled} onClick={() => onAction("set_mode", "heat")}
            aria-pressed={chill.on && chill.mode === "heat"}
            className={`flex-1 rounded-full py-2 text-sm ${chill.on && chill.mode === "heat" ? "bg-white text-black" : ""}`}>
            ♨ Verwarmen
          </button>
        </div>
        <button aria-label="aan/uit" disabled={disabled} onClick={() => onAction("on_off", !chill.on)}
          className={`h-11 w-11 rounded-full ${chill.on ? "bg-white text-black" : "border border-neutral-700"}`}>⏻</button>
      </div>

      <div className="mt-3 flex rounded-full bg-neutral-800 p-1">
        {chill.fanOptions.map((f) => (
          <button key={f} disabled={disabled} onClick={() => onAction("set_fan", f)}
            aria-pressed={chill.fan === f}
            className={`flex-1 rounded-full py-2 text-sm ${chill.fan === f ? "bg-white text-black" : ""}`}>
            {f}
          </button>
        ))}
      </div>
    </section>
  );
}
