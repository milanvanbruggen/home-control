"use client";
import { Lightbulb } from "lucide-react";
import type { SceneRef } from "@/lib/types";
import { Card } from "@/app/components/ui/card";
import { Button } from "@/app/components/ui/button";

export function LightScenes({
  scenes,
  onScene,
}: {
  scenes: SceneRef[];
  onScene: (id: string) => void;
}) {
  return (
    <Card aria-label="Verlichting woonkamer">
      <div className="mb-4 flex items-center gap-2">
        <Lightbulb size={16} className="text-[var(--muted)]" aria-hidden />
        <h2 className="text-lg font-medium tracking-tight">Woonkamer</h2>
      </div>
      <div className="grid grid-cols-2 gap-2.5">
        {scenes.map((s) => {
          const isOff = s.id === "woonkamer_uit" || s.name === "Uit";
          return (
            <Button
              key={s.id}
              variant={isOff ? "outline" : "tile"}
              onClick={() => onScene(s.id)}
            >
              {s.name}
            </Button>
          );
        })}
      </div>
    </Card>
  );
}
