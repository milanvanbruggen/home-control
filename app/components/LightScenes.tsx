"use client";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { Lightbulb, Loader2, Power, Palette, Check } from "lucide-react";
import type { SceneRef, LightState } from "@/lib/types";
import { Card } from "@/app/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/app/components/ui/dialog";
import { sceneGradient } from "@/lib/scene-visuals";

const UIT_ID = "woonkamer_uit";

function isActiveScene(id: string, activeScene?: string | null): boolean {
  return !!activeScene && id === activeScene && id !== UIT_ID;
}

/** A single scene tile, shared by the favorites grid and the "Alle scenes" modal. */
function SceneTile({
  scene,
  active,
  loading,
  onActivate,
}: {
  scene: SceneRef;
  active: boolean;
  loading?: boolean;
  onActivate: (id: string) => void;
}) {
  const isUit = scene.id === UIT_ID;
  return (
    <button
      type="button"
      disabled={loading}
      aria-pressed={active}
      onClick={() => onActivate(scene.id)}
      style={{ backgroundImage: sceneGradient(scene.id) }}
      className={`relative flex h-[4.25rem] items-end overflow-hidden rounded-2xl p-3 text-left transition active:scale-[0.98] disabled:cursor-default${
        active ? " ring-2 ring-inset ring-white" : ""
      }`}
    >
      <span
        aria-hidden
        className="absolute inset-x-0 bottom-0 h-2/3"
        style={{ backgroundImage: "linear-gradient(transparent, rgba(0,0,0,0.30))" }}
      />
      {/* "Uit" is a function (turns the lights off), not a scene — flag it with a power icon. */}
      {isUit && (
        <Power
          size={16}
          aria-hidden
          className="absolute right-2.5 top-2.5 z-10 text-white/90 drop-shadow-[0_1px_2px_rgba(0,0,0,0.5)]"
        />
      )}
      {/* The currently active scene gets a check badge. */}
      {active && !loading && (
        <span
          aria-hidden
          className="absolute right-2 top-2 z-10 flex h-5 w-5 items-center justify-center rounded-full bg-white shadow"
        >
          <Check size={13} strokeWidth={3} className="text-[#1b2b46]" />
        </span>
      )}
      <span className="relative z-10 text-sm font-semibold text-white drop-shadow-[0_1px_3px_rgba(0,0,0,0.4)]">
        {scene.name}
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
}

export function LightScenes({
  scenes,
  allScenes,
  activeScene,
  onScene,
  light,
  onBrightness,
}: {
  scenes: SceneRef[];
  allScenes?: SceneRef[];
  activeScene?: string | null;
  onScene: (id: string) => void;
  light?: LightState;
  onBrightness?: (id: string, brightness: number) => void;
}) {
  const [pending, setPending] = useState<number | null>(null);
  const [loadingScene, setLoadingScene] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sceneTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mounted = useRef(true);

  // Reset optimistic brightness when the server-confirmed value arrives.
  useEffect(() => { setPending(null); }, [light?.brightness]);
  useEffect(() => {
    // Set true on mount so React 18 StrictMode's mount→unmount→remount in dev
    // doesn't leave this stuck false (which would freeze the scene spinner).
    mounted.current = true;
    return () => {
      mounted.current = false;
      if (timer.current) clearTimeout(timer.current);
      if (sceneTimer.current) clearTimeout(sceneTimer.current);
    };
  }, []);

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

  const hasAll = !!allScenes && allScenes.length > 0;

  // Name of the active scene (favorite or not) so the home screen always shows it.
  const activeName =
    activeScene && activeScene !== UIT_ID
      ? (allScenes ?? scenes).find((s) => s.id === activeScene)?.name ?? null
      : null;

  return (
    <Card aria-label="Verlichting woonkamer">
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <div className="mb-4 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Lightbulb size={16} className="text-[var(--muted)]" aria-hidden />
            <div>
              <h2 className="text-lg font-semibold tracking-tight">Woonkamer</h2>
              {activeName && (
                <p className="flex items-center gap-1 text-xs text-[var(--muted)]">
                  <Check size={11} strokeWidth={3} aria-hidden /> {activeName}
                </p>
              )}
            </div>
          </div>
          {hasAll && (
            <DialogTrigger asChild>
              <button
                type="button"
                className="flex items-center gap-1.5 rounded-full px-3 py-2 text-sm font-medium text-[var(--muted)] transition hover:bg-black/[0.05] hover:text-[#1b2b46] active:scale-95"
              >
                <Palette size={15} aria-hidden /> Alle scenes
              </button>
            </DialogTrigger>
          )}
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
          {scenes.map((s) => (
            <SceneTile
              key={s.id}
              scene={s}
              active={isActiveScene(s.id, activeScene)}
              loading={loadingScene === s.id}
              onActivate={activateScene}
            />
          ))}
        </div>

        {hasAll && (
          <DialogContent aria-describedby={undefined}>
            <DialogHeader>
              <DialogTitle>Alle scenes</DialogTitle>
            </DialogHeader>
            <div className="grid grid-cols-2 gap-2.5">
              {allScenes!.map((s) => (
                <SceneTile
                  key={s.id}
                  scene={s}
                  active={isActiveScene(s.id, activeScene)}
                  onActivate={(id) => {
                    setModalOpen(false);
                    activateScene(id);
                  }}
                />
              ))}
            </div>
          </DialogContent>
        )}
      </Dialog>
    </Card>
  );
}
