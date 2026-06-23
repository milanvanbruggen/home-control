"use client";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { Lightbulb, Loader2 } from "lucide-react";
import type { SceneRef, LightState } from "@/lib/types";
import { Card } from "@/app/components/ui/card";
import { sceneGradient } from "@/lib/scene-visuals";

export function LightScenes({
  scenes,
  onScene,
  light,
  onBrightness,
}: {
  scenes: SceneRef[];
  onScene: (id: string) => void;
  light?: LightState;
  onBrightness?: (id: string, brightness: number) => void;
}) {
  const [pending, setPending] = useState<number | null>(null);
  const [loadingScene, setLoadingScene] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sceneTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mounted = useRef(true);

  // Reset optimistic brightness when the server-confirmed value arrives.
  useEffect(() => { setPending(null); }, [light?.brightness]);
  useEffect(
    () => () => {
      mounted.current = false;
      if (timer.current) clearTimeout(timer.current);
      if (sceneTimer.current) clearTimeout(sceneTimer.current);
    },
    [],
  );

  const brightness = pending ?? light?.brightness ?? 0;

  function slide(v: number) {
    setPending(v);
    if (timer.current) clearTimeout(timer.current);
    if (light) timer.current = setTimeout(() => onBrightness?.(light.id, v), 350);
  }

  async function activateScene(id: string) {
    setLoadingScene(id);
    const started = Date.now();
    try {
      await Promise.resolve(onScene(id));
    } finally {
      // keep the spinner visible briefly so the tap feels acknowledged
      const wait = Math.max(0, 500 - (Date.now() - started));
      if (sceneTimer.current) clearTimeout(sceneTimer.current);
      sceneTimer.current = setTimeout(() => {
        if (mounted.current) setLoadingScene((cur) => (cur === id ? null : cur));
      }, wait);
    }
  }

  return (
    <Card aria-label="Verlichting woonkamer">
      <div className="mb-4 flex items-center gap-2">
        <Lightbulb size={16} className="text-[var(--muted)]" aria-hidden />
        <h2 className="text-lg font-semibold tracking-tight">Woonkamer</h2>
      </div>

      {light && (
        <div className="mb-4">
          <div className="mb-2 flex items-center justify-between text-sm text-[var(--muted)]">
            <span>Helderheid</span>
            <span className="flex items-center gap-1.5 font-medium tabular-nums text-foreground">
              {pending != null && <Loader2 size={12} className="animate-spin text-[var(--muted)]" aria-hidden />}
              {brightness}%
            </span>
          </div>
          <input
            type="range"
            min={0}
            max={100}
            value={brightness}
            aria-label="Helderheid"
            onChange={(e) => slide(Number(e.target.value))}
            className="brightness-slider w-full"
            style={{ "--pct": brightness } as CSSProperties}
          />
        </div>
      )}

      <div className="grid grid-cols-2 gap-2.5">
        {scenes.map((s) => {
          const loading = loadingScene === s.id;
          return (
            <button
              key={s.id}
              type="button"
              disabled={loading}
              onClick={() => activateScene(s.id)}
              style={{ backgroundImage: sceneGradient(s.id) }}
              className="relative flex h-[4.25rem] items-end overflow-hidden rounded-2xl p-3 text-left transition active:scale-[0.98] disabled:cursor-default"
            >
              <span
                aria-hidden
                className="absolute inset-x-0 bottom-0 h-2/3"
                style={{ backgroundImage: "linear-gradient(transparent, rgba(0,0,0,0.30))" }}
              />
              <span className="relative z-10 text-sm font-semibold text-white drop-shadow-[0_1px_3px_rgba(0,0,0,0.4)]">
                {s.name}
              </span>
              {loading && (
                <Loader2
                  size={18}
                  aria-hidden
                  className="absolute right-3 top-3 z-10 animate-spin text-white drop-shadow-[0_1px_3px_rgba(0,0,0,0.5)]"
                />
              )}
            </button>
          );
        })}
      </div>
    </Card>
  );
}
