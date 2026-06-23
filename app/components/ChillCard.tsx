"use client";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { Snowflake, Flame, Power, Minus, Plus } from "lucide-react";
import type { ChillState } from "@/lib/types";
import { Card } from "@/app/components/ui/card";
import { Badge } from "@/app/components/ui/badge";
import { Button } from "@/app/components/ui/button";

type Action = (action: string, value: boolean | string | number) => void;

// Quatt reports fan modes in English; show Dutch labels (low→high) while sending the raw value.
const FAN_LABEL: Record<string, string> = { Low: "Laag", Normal: "Normaal", High: "Hoog" };
const FAN_RANK: Record<string, number> = { Low: 0, Normal: 1, High: 2 };

/** Map Quatt's raw status string to a friendly Dutch label (null = hide the badge). */
function chillStatusLabel(status: string | null): string | null {
  if (!status) return null;
  const s = status.toLowerCase();
  if (s.includes("working")) return "Aan het werken";
  if (s.includes("starting")) return "Aan het starten";
  if (s.includes("limit") || s.includes("capacit")) return "Wacht op capaciteit";
  if (s.includes("off") || s === "uit") return "Uit";
  return status;
}

export function ChillCard({ chill, onAction }: { chill: ChillState; onAction: Action }) {
  const [pendingTemp, setPendingTemp] = useState<number | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Reset optimistic temp when the server-confirmed value arrives.
  useEffect(() => { setPendingTemp(null); }, [chill.temp]);

  // Clear any pending debounce timer on unmount.
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const shown = pendingTemp ?? chill.temp ?? chill.min;

  function bumpTemp(delta: number) {
    const next = Math.min(chill.max, Math.max(chill.min, shown + delta * chill.step));
    setPendingTemp(next);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => onAction("set_temp", next), 400);
  }

  const disabled = !chill.available;
  const activeCool = chill.on && chill.mode === "cool";
  const activeHeat = chill.on && chill.mode === "heat";

  // Accent follows on + mode: cooling = cyan, heating = amber, off/idle = neutral.
  const accentVar = !chill.on
    ? "var(--accent-neutral)"
    : chill.mode === "heat"
      ? "var(--accent-heat)"
      : chill.mode === "cool"
        ? "var(--accent-cool)"
        : "var(--accent-neutral)";

  const cardStyle = {
    "--accent": accentVar,
    borderColor: chill.on ? "color-mix(in oklab, var(--accent) 35%, var(--card-border))" : "var(--card-border)",
    boxShadow: chill.on
      ? "0 0 0 1px color-mix(in oklab, var(--accent) 22%, transparent), 0 24px 60px -34px var(--accent)"
      : undefined,
  } as CSSProperties;

  const segActive: CSSProperties = {
    background: "color-mix(in oklab, var(--accent) 22%, transparent)",
    color: "var(--foreground)",
    boxShadow: "0 0 22px -8px var(--accent)",
  };
  const segIdle: CSSProperties = { color: "var(--muted)" };

  const statusLabel = chillStatusLabel(chill.status);
  const statusTone = statusLabel === "Wacht op capaciteit" || statusLabel === "Aan het starten" ? "warn" : "neutral";

  // Order known fan modes low→high; keep unknown values in their original order.
  const fans = chill.fanOptions
    .map((raw, idx) => ({ raw, key: raw in FAN_RANK ? FAN_RANK[raw] : 1000 + idx }))
    .sort((a, b) => a.key - b.key);

  return (
    <Card aria-label={chill.name} style={cardStyle} className="transition-shadow duration-500">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-medium tracking-tight">{chill.name}</h2>
          <p className="mt-0.5 flex items-center gap-1.5 text-sm text-[var(--muted)]">
            {chill.mode === "heat" ? <Flame size={14} aria-hidden /> : <Snowflake size={14} aria-hidden />}
            <span>{chill.current != null ? `${chill.current.toFixed(1).replace(".", ",")}°C` : "—"}</span>
            <span className="text-xs">nu</span>
          </p>
        </div>
        {statusLabel && <Badge tone={statusTone}>{statusLabel}</Badge>}
      </div>

      <div className="mt-5 flex items-center justify-center gap-7">
        <Button aria-label="−" variant="control" size="icon" disabled={disabled} onClick={() => bumpTemp(-1)}>
          <Minus size={22} aria-hidden />
        </Button>
        <span
          className="font-display text-6xl font-medium leading-none tabular-nums"
          style={{ color: chill.on ? "var(--accent)" : "var(--foreground)" }}
        >
          {shown}°C
        </span>
        <Button aria-label="+" variant="control" size="icon" disabled={disabled} onClick={() => bumpTemp(1)}>
          <Plus size={22} aria-hidden />
        </Button>
      </div>

      <div className="mt-6 flex items-center gap-3">
        <div className="grid flex-1 grid-cols-2 gap-1 rounded-full bg-white/[0.04] p-1">
          <button
            type="button" disabled={disabled} onClick={() => onAction("set_mode", "cool")}
            aria-pressed={activeCool}
            style={activeCool ? segActive : segIdle}
            className="flex items-center justify-center gap-1.5 rounded-full py-2.5 text-sm font-medium transition active:scale-[0.98] disabled:opacity-40"
          >
            <Snowflake size={15} aria-hidden /> Koelen
          </button>
          <button
            type="button" disabled={disabled} onClick={() => onAction("set_mode", "heat")}
            aria-pressed={activeHeat}
            style={activeHeat ? segActive : segIdle}
            className="flex items-center justify-center gap-1.5 rounded-full py-2.5 text-sm font-medium transition active:scale-[0.98] disabled:opacity-40"
          >
            <Flame size={15} aria-hidden /> Verwarmen
          </button>
        </div>
        <button
          type="button" aria-label="aan/uit" disabled={disabled} onClick={() => onAction("on_off", !chill.on)}
          style={chill.on ? { ...segActive, borderColor: "transparent" } : { color: "var(--muted)" }}
          className="flex h-[3.25rem] w-[3.25rem] shrink-0 items-center justify-center rounded-full border border-white/12 transition active:scale-95 disabled:opacity-40"
        >
          <Power size={20} aria-hidden />
        </button>
      </div>

      <div className="mt-3 grid grid-cols-3 gap-1 rounded-full bg-white/[0.04] p-1">
        {fans.map(({ raw }) => {
          const on = chill.fan === raw;
          return (
            <button
              key={raw} type="button" disabled={disabled} onClick={() => onAction("set_fan", raw)}
              aria-pressed={on}
              style={on ? segActive : segIdle}
              className="rounded-full py-2.5 text-sm font-medium transition active:scale-[0.98] disabled:opacity-40"
            >
              {FAN_LABEL[raw] ?? raw}
            </button>
          );
        })}
      </div>
    </Card>
  );
}
