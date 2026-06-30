"use client";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { Lightbulb, Loader2, PowerOff, Palette, Check, ChevronsUpDown, BatteryFull, BatteryMedium, BatteryLow, BatteryWarning } from "lucide-react";
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
import { batteryLevel } from "@/lib/battery";
import { useT } from "@/app/components/LanguageProvider";
import { Menu, MenuItem } from "@/app/components/ui/menu";

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
      style={{ backgroundImage: scene.gradient ?? sceneGradient(scene.id, scene.name) }}
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
        {isUit && <PowerOff size={15} aria-hidden />}
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
  const [modalOpen, setModalOpen] = useState(false);
  const [loadingScene, setLoadingScene] = useState<string | null>(null);
  const [pending, setPending] = useState<number | null>(null);
  const [display, setDisplay] = useState(() => rooms[0]?.brightness ?? 0);
  // Optimistically hide the active-scene badge the moment a room's lights go off
  // (until the poll catches up or a new scene is picked). Keyed to the scene we hid.
  const [cleared, setCleared] = useState<{ room: string; scene: string } | null>(null);
  const t = useT();

  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sceneTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const confirmTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rafRef = useRef<number | null>(null);
  const displayRef = useRef(display);
  displayRef.current = display;
  const prevKey = useRef(selectedKey);
  const mounted = useRef(true);

  const current = rooms.find((r) => r.key === selectedKey) ?? rooms[0];

  // Stop the "saving" spinner once the house confirms the new brightness via polling
  // (brightness_pct round-trips exactly). Adjusting state during render is React's
  // recommended alternative to a syncing effect; `slide` arms a fallback so the
  // spinner can never spin forever if the command never lands (offline/failed).
  if (pending != null && current && current.brightness === pending) setPending(null);

  const target = pending ?? current?.brightness ?? 0;

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      if (timer.current) clearTimeout(timer.current);
      if (sceneTimer.current) clearTimeout(sceneTimer.current);
      if (confirmTimer.current) clearTimeout(confirmTimer.current);
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

  if (!current) {
    return (
      <Card aria-label={t("lights.section")}>
        <p className="text-sm text-[var(--muted)]">{t("lights.noRooms")}</p>
      </Card>
    );
  }

  function slide(v: number) {
    setPending(v);
    if (v === 0) setCleared({ room: current!.key, scene: current!.activeScene ?? "" });
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => onBrightness?.(current!.lightId, v), 350);
    // Fallback: drop the optimistic value (and its spinner) even if the poll never
    // confirms — e.g. the command failed — so it can't hang. ~2 poll cycles.
    if (confirmTimer.current) clearTimeout(confirmTimer.current);
    confirmTimer.current = setTimeout(() => {
      if (mounted.current) setPending((cur) => (cur === v ? null : cur));
    }, 6000);
  }

  async function activateScene(id: string) {
    // Off (Uit tile) hides the badge optimistically; a real scene drops the override.
    setCleared(isUitId(id) ? { room: current!.key, scene: current!.activeScene ?? "" } : null);
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
    setModalOpen(false);
    setPending(null);
    if (confirmTimer.current) clearTimeout(confirmTimer.current);
    setLoadingScene(null);
  }

  // The quick grid shows the room's favorites (resolved to their scene objects).
  const gridScenes = current.favorites
    .map((id) => current.scenes.find((s) => s.id === id))
    .filter((s): s is SceneRef => !!s);
  // While `cleared` matches the server's still-reported scene, hide the badge.
  const effectiveActive =
    cleared && cleared.room === current.key && cleared.scene === current.activeScene
      ? null
      : current.activeScene;
  const activeName = effectiveActive
    ? current.scenes.find((s) => s.id === effectiveActive)?.name ?? null
    : null;
  const uit: SceneRef = { id: uitId(current.key), name: t("common.off") };

  return (
    <Card aria-label={t("lights.section")}>
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <div className="mb-1 flex items-center justify-between gap-2">
          {/* Room switcher */}
          <Menu
            label={t("lights.switchRoom", { room: current.name })}
            triggerClassName="-ml-1 flex items-center gap-2 rounded-xl px-2 py-1 transition hover:bg-foreground/5 active:scale-[0.98]"
            trigger={
              <>
                <Lightbulb size={16} className="text-[var(--muted)]" aria-hidden />
                <h2 className="text-lg font-semibold tracking-tight">{current.name}</h2>
                <ChevronsUpDown size={15} className="text-[var(--muted)]" aria-hidden />
              </>
            }
          >
            {(close) =>
              rooms.map((r) => (
                <MenuItem
                  key={r.key}
                  selected={r.key === current.key}
                  onSelect={() => {
                    pickRoom(r.key);
                    close();
                  }}
                >
                  {r.name}
                </MenuItem>
              ))
            }
          </Menu>

          {current?.batteryPct != null && (() => {
            const { level, low } = batteryLevel(current.batteryPct);
            const Icon = level === "full" ? BatteryFull : level === "medium" ? BatteryMedium : level === "low" ? BatteryLow : BatteryWarning;
            return (
              <Icon
                size={15}
                aria-label={`Battery ${current.batteryPct}%`}
                className={low ? "text-[#e85f4c]" : "text-[var(--muted)]"}
              />
            );
          })()}

          <DialogTrigger asChild>
            <button
              type="button"
              className="flex items-center gap-1.5 rounded-full px-3 py-2 text-sm font-medium text-[var(--muted)] transition hover:bg-foreground/5 hover:text-foreground active:scale-95"
            >
              <Palette size={15} aria-hidden /> {t("lights.allScenes")}
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
            <span>{t("lights.brightness")}</span>
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
            aria-label={t("lights.brightness")}
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
              active={s.id === effectiveActive}
              loading={loadingScene === s.id}
              onActivate={activateScene}
            />
          ))}
          <SceneTile scene={uit} active={false} loading={loadingScene === uit.id} onActivate={activateScene} />
        </div>

        {/* Whole-house off: same grey/PowerOff family as the per-room Uit tile, but set
            apart by a divider + full-width row to read as a higher-level action. */}
        <div className="mt-3 border-t border-[var(--card-border)] pt-3">
          <button
            type="button"
            onClick={() => { setCleared({ room: current.key, scene: current.activeScene ?? "" }); onBrightness?.("all", 0); }}
            className="flex min-h-[44px] w-full items-center justify-center gap-2 rounded-2xl bg-foreground/5 py-3 text-sm font-semibold text-[var(--muted)] transition hover:bg-foreground/10 active:scale-[0.99]"
          >
            <PowerOff size={16} aria-hidden /> {t("lights.allLightsOff")}
            <span className="text-xs font-normal text-[var(--muted)]">· {t("lights.wholeHouse")}</span>
          </button>
        </div>

        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("lights.allScenesTitle", { room: current.name })}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-2.5">
            {current.scenes.map((s) => (
              <SceneTile
                key={s.id}
                scene={s}
                active={s.id === effectiveActive}
                onActivate={(id) => { setModalOpen(false); activateScene(id); }}
              />
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
