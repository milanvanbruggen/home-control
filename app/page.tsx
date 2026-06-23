"use client";
import { usePolling } from "@/app/hooks/usePolling";
import { postClimate, postScene } from "@/app/lib/api";
import { ChillCard } from "@/app/components/ChillCard";
import { ThermostatCard } from "@/app/components/ThermostatCard";
import { LightScenes } from "@/app/components/LightScenes";
import { ConnectionBanner } from "@/app/components/ConnectionBanner";

export default function Home() {
  const { state, connected } = usePolling(3000);

  return (
    <main className="mx-auto flex max-w-md flex-col gap-4 p-4">
      <ConnectionBanner connected={connected} />
      {!state ? (
        <p className="py-10 text-center text-neutral-400">Laden…</p>
      ) : (
        <>
          <LightScenes scenes={state.scenes} onScene={(id) => postScene(id)} />
          {state.thermostat && <ThermostatCard thermostat={state.thermostat} />}
          {state.chills.map((chill) => (
            <ChillCard
              key={chill.id}
              chill={chill}
              onAction={(action, value) => postClimate(chill.id, action, value)}
            />
          ))}
        </>
      )}
    </main>
  );
}
