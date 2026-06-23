"use client";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { Lightbulb, Loader2, Power, PowerOff, Palette, Check, ChevronsUpDown } from "lucide-react";
import type { RoomState, SceneRef } from "@/lib/types";
import { Card } from "@/app/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/app/components/ui/dialog";
import { sceneGradient } from "@/lib/scene-visuals";

const GRID_COUNT = 7; // scenes shown in the grid (the rest live in the "Alle scenes" modal)

function uitId(roomKey: string): string {
  return `${roomKey}_uit`;
}
function isUitId(id: string): boolean {
  return id.endsWith("_uit");
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
  const isUit = isUitId(scene.id);
  return (
    <button
      type="button"
      disabled={loading}
      aria-pressed={active}
      onClick={() => onActivate(scene.id)}
      style={{ backgroundImage: sceneGradient(scene.id, scene.name) }}
      className="relative flex h-[4.25rem] items-end overflow-hidden rounded-2xl p-3 text-left transition active:scale-[0.98] disabled:cursor-default"
    >
      <span
        aria-hidden
        className="absolute inset-x-0 bottom-0 h-2/3"
        style={{ backgroundImage: "linear-gradient(transparent, rgba(0,0,0,0.30))" }}
      />
      {active && !loading && (
        <span
          aria-hidden
          className="absolute right-2 top-2 z-10 flex h-5 w-5 items-center justify-center rounded-full bg-white shadow"
        >
          <Check size={13} strokeWidth={3} className="text-[#1b2b46]" />
        </span>
      )}
      <span className="relative z-10 flex items-center gap-1.5 text-sm font-semibold text-white drop-shadow-[0_1px_3px_rgba(0,0,0,0.4)]">
        {isUit && <Power size={15} aria-hidden />}
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
  rooms,
  onScene,
  onBrightness,
}: {
  rooms: RoomState[];
  onScene: (id: string) => void;
  onBrightness?: (lightId: string, brightness: number) => void;
}) {
  const [selectedKey, setSelectedKey] = useState(rooms[0]?.key ?? "");
  const [menuOpen, setMenuOpen] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [loadingScene, setLoadingScene] = useState<string | null>(null);
  const [pending, setPending] = useState<number | null>(null);
  const [display, setDisplay] = useState(() => rooms[0]?.brightness ?? 0);

  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sceneTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rafRef = useRef<number | null>(null);
  const displayRef = useRef(display);
  displayRef.current = display;
  const prevKey = useRef(selectedKey);
  const menuRef = useRef<HTMLDivElement>(null);
  const mounted = useRef(true);

  const current = rooms.find((r) => r.key === selectedKey) ?? rooms[0];
  const target = pending ?? current?.brightness ?? 0;

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      if (timer.current) clearTimeout(timer.current);
      if (sceneTimer.current) clearTimeout(sceneTimer.current);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  // Animate the slider toward the target; jump instantly on a room switch or while dragging.
  useEffect(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    if (prevKey.current !== selectedKey) {
      prevKey.current = selectedKey;
      setDisplay(target);
      return;
    }
    if (pending != null) {
      setDisplay(pending);
      return;
    }
    const from = displayRef.current;
    if (from === target) return;
    const start = performance.now();
    const duration = 400;
    const stepFn = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplay(Math.round(from + (target - from) * eased));
      if (t < 1) rafRef.current = requestAnimationFrame(stepFn);
    };
    rafRef.current = requestAnimationFrame(stepFn);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [target, pending, selectedKey]);

  // Close the room menu on outside-click / Escape.
  useEffect(() => {
    if (!menuOpen) return;
    function onDown(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setMenuOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  if (!current) {
    return (
      <Card aria-label="Verlichting">
        <p className="text-sm text-[var(--muted)]">Geen ruimtes beschikbaar.</p>
      </Card>
    );
  }

  function slide(v: number) {
    setPending(v);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => onBrightness?.(current!.lightId, v), 350);
  }

  async function activateScene(id: string) {
    setLoadingScene(id);
    const started = Date.now();
    try {
      await Promise.resolve(onScene(id));
    } finally {
      const wait = Math.max(0, 500 - (Date.now() - started));
      if (sceneTimer.current) clearTimeout(sceneTimer.current);
      sceneTimer.current = setTimeout(() => {
        if (mounted.current) setLoadingScene((cur) => (cur === id ? null : cur));
      }, wait);
    }
  }

  function pickRoom(key: string) {
    setSelectedKey(key);
    setMenuOpen(false);
    setModalOpen(false);
    setPending(null);
    setLoadingScene(null);
  }

  const gridScenes = current.scenes.slice(0, GRID_COUNT);
  const activeName = current.activeScene
    ? current.scenes.find((s) => s.id === current.activeScene)?.name ?? null
    : null;
  const uit: SceneRef = { id: uitId(current.key), name: "Uit" };

  return (
    <Card aria-label="Verlichting">
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <div className="mb-1 flex items-center justify-between gap-2">
          {/* Room switcher */}
          <div className="relative" ref={menuRef}>
            <button
              type="button"
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              aria-label={`Ruimte wisselen (nu ${current.name})`}
              onClick={() => setMenuOpen((o) => !o)}
              className="-ml-1 flex items-center gap-2 rounded-xl px-2 py-1 transition hover:bg-black/[0.04] active:scale-[0.98]"
            >
              <Lightbulb size={16} className="text-[var(--muted)]" aria-hidden />
              <h2 className="text-lg font-semibold tracking-tight">{current.name}</h2>
              <ChevronsUpDown size={15} className="text-[var(--muted)]" aria-hidden />
            </button>
            {menuOpen && (
              <div
                role="menu"
                className="absolute left-0 top-full z-40 mt-1 w-56 origin-top-left animate-in fade-in-0 zoom-in-95 rounded-2xl border border-[var(--card-border)] bg-white p-1.5 shadow-xl duration-150"
              >
                {rooms.map((r) => {
                  const sel = r.key === current.key;
                  return (
                    <button
                      key={r.key}
                      type="button"
                      role="menuitem"
                      onClick={() => pickRoom(r.key)}
                      className={`flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left text-sm transition hover:bg-black/[0.05] ${
                        sel ? "font-semibold text-[#1b2b46]" : "text-[#1b2b46]/80"
                      }`}
                    >
                      {r.name}
                      {sel && <Check size={15} strokeWidth={3} className="text-[#1b2b46]" aria-hidden />}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <DialogTrigger asChild>
            <button
              type="button"
              className="flex items-center gap-1.5 rounded-full px-3 py-2 text-sm font-medium text-[var(--muted)] transition hover:bg-black/[0.05] hover:text-[#1b2b46] active:scale-95"
            >
              <Palette size={15} aria-hidden /> Alle scenes
            </button>
          </DialogTrigger>
        </div>

        {activeName && (
          <p className="mb-3 ml-1 flex items-center gap-1 text-xs text-[var(--muted)]">
            <Check size={11} strokeWidth={3} aria-hidden /> {activeName}
          </p>
        )}

        <div className="mb-4">
          <div className="mb-2 flex items-center justify-between text-sm text-[var(--muted)]">
            <span>Helderheid</span>
            <span className="flex items-center gap-1.5 font-medium tabular-nums text-foreground">
              {pending != null && <Loader2 size={12} className="animate-spin text-[var(--muted)]" aria-hidden />}
              {display}%
            </span>
          </div>
          <input
            type="range"
            min={0}
            max={100}
            value={display}
            aria-label="Helderheid"
            onChange={(e) => slide(Number(e.target.value))}
            className="brightness-slider w-full"
            style={{ "--pct": display } as CSSProperties}
          />
        </div>

        <div className="grid grid-cols-2 gap-2.5">
          {gridScenes.map((s) => (
            <SceneTile
              key={s.id}
              scene={s}
              active={s.id === current.activeScene}
              loading={loadingScene === s.id}
              onActivate={activateScene}
            />
          ))}
          <SceneTile scene={uit} active={false} loading={loadingScene === uit.id} onActivate={activateScene} />
        </div>

        <button
          type="button"
          onClick={() => onBrightness?.("all", 0)}
          className="mt-2.5 flex min-h-[44px] w-full items-center justify-center gap-2 rounded-2xl border border-[var(--card-border)] bg-black/[0.02] py-3 text-sm font-medium text-[var(--muted)] transition hover:bg-black/[0.05] hover:text-[#1b2b46] active:scale-[0.99]"
        >
          <PowerOff size={15} aria-hidden /> Alle lampen uit
          <span className="text-xs">· hele huis</span>
        </button>

        <DialogContent>
          <DialogHeader>
            <DialogTitle>Alle scenes — {current.name}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-2.5">
            {current.scenes.map((s) => (
              <SceneTile
                key={s.id}
                scene={s}
                active={s.id === current.activeScene}
                onActivate={(id) => { setModalOpen(false); activateScene(id); }}
              />
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
