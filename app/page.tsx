"use client";
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
        <p className="py-16 text-center text-[var(--muted)]">Laden…</p>
      ) : (
        <>
          <div className="animate-rise" style={{ animationDelay: "60ms" }}>
            <LightScenes
              scenes={state.scenes}
              allScenes={state.allScenes}
              activeScene={state.activeScene}
              onScene={(id) => postScene(id)}
              light={state.lights[0]}
              onBrightness={(id, pct) => postLight(id, pct)}
            />
          </div>
          {state.thermostat && (
            <div className="animate-rise" style={{ animationDelay: "120ms" }}>
              <ThermostatCard thermostat={state.thermostat} />
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
