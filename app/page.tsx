"use client";
import { Loader2 } from "lucide-react";
import { usePolling } from "@/app/hooks/usePolling";
import { postClimate, postScene, postLight } from "@/app/lib/api";
import { ChillCard } from "@/app/components/ChillCard";
import { ThermostatCard } from "@/app/components/ThermostatCard";
import { LightScenes } from "@/app/components/LightScenes";
import { ConnectionBanner } from "@/app/components/ConnectionBanner";

export default function Home() {
  const { state, connected } = usePolling(3000);

  return (
    <main className="mx-auto flex w-full max-w-md flex-col gap-4 px-4 pb-10 pt-8">
      <header className="animate-rise px-1">
        <p className="text-sm text-[var(--muted)]">Welkom thuis</p>
        <h1 className="font-display text-3xl font-medium tracking-tight">Huisbediening</h1>
      </header>

      <ConnectionBanner connected={connected} />

      {!state ? (
        <div className="flex justify-center py-20" role="status" aria-label="Laden">
          <Loader2 size={32} className="animate-spin text-[var(--muted)]" aria-hidden />
        </div>
      ) : (
        <>
          <div className="animate-rise" style={{ animationDelay: "60ms" }}>
            <LightScenes
              rooms={state.rooms}
              onScene={(id) => postScene(id)}
              onBrightness={(id, pct) => postLight(id, pct)}
            />
          </div>
          {state.thermostat && (
            <div className="animate-rise" style={{ animationDelay: "120ms" }}>
              <ThermostatCard
                thermostat={state.thermostat}
                onAction={(action, value) => postClimate(state.thermostat!.id, action, value)}
              />
            </div>
          )}
          {state.chills.map((chill, i) => (
            <div key={chill.id} className="animate-rise" style={{ animationDelay: `${180 + i * 60}ms` }}>
              <ChillCard
                chill={chill}
                onAction={(action, value) => postClimate(chill.id, action, value)}
              />
            </div>
          ))}
        </>
      )}
    </main>
  );
}
