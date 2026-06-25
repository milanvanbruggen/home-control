"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Loader2, Settings } from "lucide-react";
import { usePolling } from "@/app/hooks/usePolling";
import { postClimate, postScene, postLight } from "@/app/lib/api";
import { ChillCard } from "@/app/components/ChillCard";
import { ThermostatCard } from "@/app/components/ThermostatCard";
import { LightScenes } from "@/app/components/LightScenes";
import { ConnectionBanner } from "@/app/components/ConnectionBanner";
import { RoomMetricCard } from "@/app/components/RoomMetricCard";
import { useT } from "@/app/components/LanguageProvider";
import { defaultCardIds, orderCardIds } from "@/lib/home-cards";
import type { AppState, ChillState, RoomMetrics } from "@/lib/types";

type Unit =
  | { kind: "lights" }
  | { kind: "thermostat" }
  | { kind: "chill"; chill: ChillState }
  | { kind: "metric"; room: RoomMetrics }
  | { kind: "pair"; rooms: RoomMetrics[] };

/** Render the home cards in the user's saved order, pairing adjacent single-metric
 *  metric rooms two-per-column. */
function HomeGrid({ state, cardOrder }: { state: AppState; cardOrder: string[] }) {
  const orderedIds = orderCardIds(defaultCardIds(state), cardOrder);
  const metricByKey = new Map(state.metrics.map((r) => [r.key, r]));
  const chillById = new Map(state.chills.map((c) => [c.id, c]));
  const visCount = (r: RoomMetrics) => r.metrics.filter((m) => m.visible).length;

  const units: { id: string; unit: Unit }[] = [];
  for (let i = 0; i < orderedIds.length; i++) {
    const id = orderedIds[i];
    const m = metricByKey.get(id);
    if (m) {
      if (visCount(m) === 1) {
        const next = orderedIds[i + 1] ? metricByKey.get(orderedIds[i + 1]) : undefined;
        if (next && visCount(next) === 1) {
          units.push({ id, unit: { kind: "pair", rooms: [m, next] } });
          i++;
          continue;
        }
      }
      units.push({ id, unit: { kind: "metric", room: m } });
      continue;
    }
    if (id === "lights") units.push({ id, unit: { kind: "lights" } });
    else if (id === "thermostat") units.push({ id, unit: { kind: "thermostat" } });
    else {
      const c = chillById.get(id);
      if (c) units.push({ id, unit: { kind: "chill", chill: c } });
    }
  }

  return (
    <div className="columns-1 gap-4 md:columns-2 xl:columns-3">
      {units.map(({ id, unit }, i) => (
        <div key={id} className="animate-rise mb-4 break-inside-avoid" style={{ animationDelay: `${60 + i * 60}ms` }}>
          {unit.kind === "lights" && (
            <LightScenes
              rooms={state.rooms}
              onScene={(sid) => postScene(sid)}
              onBrightness={(lid, pct) => postLight(lid, pct)}
            />
          )}
          {unit.kind === "thermostat" && state.thermostat && (
            <ThermostatCard
              thermostat={state.thermostat}
              onAction={(action, value) => postClimate(state.thermostat!.id, action, value)}
            />
          )}
          {unit.kind === "chill" && (
            <ChillCard chill={unit.chill} onAction={(action, value) => postClimate(unit.chill.id, action, value)} />
          )}
          {unit.kind === "metric" && <RoomMetricCard room={unit.room} />}
          {unit.kind === "pair" && (
            <div className="flex gap-4">
              {unit.rooms.map((r) => (
                <div key={r.key} className="min-w-0 flex-1">
                  <RoomMetricCard room={r} />
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

export default function Home() {
  const { state, connected } = usePolling(3000);
  const t = useT();
  const [cardOrder, setCardOrder] = useState<string[]>([]);

  // Card order lives in settings; fetch it once on mount (re-mounts on nav back).
  useEffect(() => {
    let alive = true;
    fetch("/api/settings")
      .then((r) => r.json())
      .then((s: { cardOrder?: string[] }) => {
        if (alive) setCardOrder(s.cardOrder ?? []);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  return (
    <main className="mx-auto flex w-full max-w-md flex-col gap-4 px-4 pb-10 pt-8 md:max-w-3xl xl:max-w-6xl">
      <header className="animate-rise flex items-start justify-between gap-3 px-1">
        <div>
          <p className="text-sm text-[var(--muted)]">{t("app.welcome")}</p>
          <h1 className="font-display text-3xl font-medium tracking-tight">{t("app.title")}</h1>
        </div>
        <Link
          href="/settings"
          transitionTypes={["nav-forward"]}
          aria-label={t("settings.open")}
          className="-mr-1 mt-1 flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-[var(--muted)] transition hover:bg-foreground/5 hover:text-foreground active:scale-95"
        >
          <Settings size={22} aria-hidden />
        </Link>
      </header>

      <ConnectionBanner connected={connected} />

      {!state ? (
        <div className="flex justify-center py-20" role="status" aria-label={t("app.loading")}>
          <Loader2 size={32} className="animate-spin text-[var(--muted)]" aria-hidden />
        </div>
      ) : (
        <HomeGrid state={state} cardOrder={cardOrder} />
      )}
    </main>
  );
}
