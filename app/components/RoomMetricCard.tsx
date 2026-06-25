"use client";
import { Thermometer, Droplets } from "lucide-react";
import type { RoomMetrics } from "@/lib/types";
import { Card } from "@/app/components/ui/card";
import { useT } from "@/app/components/LanguageProvider";
import { formatMetricValue, METRIC_LABEL_KEY } from "@/lib/metrics";

export function RoomMetricCard({ room }: { room: RoomMetrics }) {
  const t = useT();
  const visible = room.metrics.filter((m) => m.visible);
  if (visible.length === 0) return null;

  return (
    <Card aria-label={room.name}>
      <h2 className="text-lg font-semibold tracking-tight">{room.name}</h2>
      <div className="mt-3 flex flex-wrap gap-x-7 gap-y-3">
        {visible.map((m) => (
          <div key={m.kind} className="flex items-center gap-2.5">
            {m.kind === "temperature" ? (
              <Thermometer size={20} className="text-[var(--accent-heat)]" aria-hidden />
            ) : (
              <Droplets size={20} className="text-[var(--ring)]" aria-hidden />
            )}
            <div>
              <p className="font-display text-2xl font-semibold leading-none tabular-nums">{formatMetricValue(m)}</p>
              <p className="mt-1 text-xs text-[var(--muted)]">{t(METRIC_LABEL_KEY[m.kind])}</p>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}
