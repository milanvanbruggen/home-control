"use client";
import type { SceneRef } from "@/lib/types";

export function LightScenes({
  scenes,
  onScene,
}: {
  scenes: SceneRef[];
  onScene: (id: string) => void;
}) {
  return (
    <section className="rounded-2xl bg-neutral-900 p-5" aria-label="Verlichting woonkamer">
      <h2 className="mb-3 text-lg font-medium text-neutral-100">Woonkamer</h2>
      <div className="grid grid-cols-2 gap-3">
        {scenes.map((s) => (
          <button
            key={s.id}
            onClick={() => onScene(s.id)}
            className="rounded-xl bg-neutral-800 py-4 text-sm text-neutral-100 active:bg-neutral-700"
          >
            {s.name}
          </button>
        ))}
      </div>
    </section>
  );
}
