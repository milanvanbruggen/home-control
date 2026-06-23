"use client";
import { useEffect, useState } from "react";
import type { AppState } from "@/lib/types";

export function usePolling(intervalMs = 3000): { state: AppState | null; connected: boolean } {
  const [state, setState] = useState<AppState | null>(null);
  const [connected, setConnected] = useState(true);

  useEffect(() => {
    let active = true;
    async function tick() {
      try {
        const res = await fetch("/api/state");
        if (!res.ok) throw new Error(`status ${res.status}`);
        const data = (await res.json()) as AppState;
        if (active) {
          setState(data);
          setConnected(true);
        }
      } catch {
        if (active) setConnected(false);
      }
    }
    tick();
    const timer = setInterval(tick, intervalMs);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [intervalMs]);

  return { state, connected };
}
