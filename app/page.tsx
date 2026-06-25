"use client";
import Link from "next/link";
import { Loader2, Settings } from "lucide-react";
import { usePolling } from "@/app/hooks/usePolling";
import { postClimate, postScene, postLight } from "@/app/lib/api";
import { ChillCard } from "@/app/components/ChillCard";
import { ThermostatCard } from "@/app/components/ThermostatCard";
import { LightScenes } from "@/app/components/LightScenes";
import { ConnectionBanner } from "@/app/components/ConnectionBanner";
import { useT } from "@/app/components/LanguageProvider";

export default function Home() {
  const { state, connected } = usePolling(3000);
  const t = useT();

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
        <div className="columns-1 gap-4 md:columns-2 xl:columns-3">
          <div className="animate-rise mb-4 break-inside-avoid" style={{ animationDelay: "60ms" }}>
            <LightScenes
              rooms={state.rooms}
              onScene={(id) => postScene(id)}
              onBrightness={(id, pct) => postLight(id, pct)}
            />
          </div>
          {state.thermostat && (
            <div className="animate-rise mb-4 break-inside-avoid" style={{ animationDelay: "120ms" }}>
              <ThermostatCard
                thermostat={state.thermostat}
                onAction={(action, value) => postClimate(state.thermostat!.id, action, value)}
              />
            </div>
          )}
          {state.chills.map((chill, i) => (
            <div key={chill.id} className="animate-rise mb-4 break-inside-avoid" style={{ animationDelay: `${180 + i * 60}ms` }}>
              <ChillCard
                chill={chill}
                onAction={(action, value) => postClimate(chill.id, action, value)}
              />
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
