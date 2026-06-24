// Runs once on server start (Next instrumentation hook). Polls the Quatt water
// sensors and shows an alert on the LaMetric when one transitions to "warning"
// (gated by the waterAlert setting). Node runtime only.

export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const g = globalThis as unknown as { __waterWatchStarted?: boolean };
  if (g.__waterWatchStarted) return; // survive dev HMR re-runs
  g.__waterWatchStarted = true;

  const [{ getStates, callService }, { CHILLS, WATER_ALERT }, { roomsNewlyWarning }, { waterAlertNotify }, { getSettings }] =
    await Promise.all([
      import("@/lib/ha-client"),
      import("@/config/devices"),
      import("@/lib/water-watch"),
      import("@/lib/water-alert"),
      import("@/lib/settings-store"),
    ]);

  const sensors = CHILLS.filter((c) => c.waterSensor).map((c) => ({ id: c.waterSensor as string, name: c.name }));
  if (sensors.length === 0) return;

  let prev: Record<string, boolean> = {};
  let seeded = false;

  async function tick(): Promise<void> {
    let states;
    try {
      states = await getStates();
    } catch {
      return; // HA momentarily unreachable — try again next tick
    }
    const byId = new Map(states.map((s) => [s.entity_id, s] as const));
    const current: Record<string, boolean> = {};
    for (const s of sensors) current[s.id] = byId.get(s.id)?.state === "on";

    if (!seeded) {
      // First reading just establishes the baseline — don't alert for tanks
      // that were already full when the server (re)started.
      prev = current;
      seeded = true;
      return;
    }

    const newly = roomsNewlyWarning(prev, current);
    prev = current;
    if (newly.length === 0 || !getSettings().waterAlert) return;

    const { language } = getSettings();
    for (const id of newly) {
      const room = sensors.find((s) => s.id === id)?.name ?? "";
      try {
        await callService(WATER_ALERT.notifyDomain, WATER_ALERT.notifyService, waterAlertNotify(room, language));
      } catch {
        // HA unreachable / notify failed — skip; next transition will try again
      }
    }
  }

  setInterval(() => void tick(), 30_000);
}
