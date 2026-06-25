// Runs once on server start (Next instrumentation hook). Polls the Quatt water
// sensors and shows an alert on the LaMetric when one transitions to "warning"
// (gated by the waterAlert setting). Node runtime only.

export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const g = globalThis as unknown as { __waterWatchStarted?: boolean };
  if (g.__waterWatchStarted) return; // survive dev HMR re-runs
  g.__waterWatchStarted = true;

  const [{ getStates, callService }, { CHILLS, WATER_ALERT }, { roomsNewlyWarning, allCleared }, { waterAlertNotify }, { getSettings }, { sampleFromStates }, { writeSample }, { alignToHalfHour, HALF_HOUR_MS }] =
    await Promise.all([
      import("@/lib/ha-client"),
      import("@/config/devices"),
      import("@/lib/water-watch"),
      import("@/lib/water-alert"),
      import("@/lib/settings-store"),
      import("@/lib/metrics-sampler"),
      import("@/lib/metrics-history-store"),
      import("@/lib/metrics-history"),
    ]);

  // Metric history: sample every configured room metric on the whole/half hour
  // (+ once now), independent of the water watcher. The stored timestamp is snapped
  // to the :00/:30 grid so charts show clean times. HA hiccups skip a tick.
  async function sampleMetrics(): Promise<void> {
    let states;
    try {
      states = await getStates();
    } catch {
      return; // HA momentarily unreachable — try again next tick
    }
    const now = Date.now();
    try {
      writeSample(sampleFromStates(states, alignToHalfHour(now)), now);
    } catch {
      // disk issue — skip this sample, next tick retries
    }
  }
  void sampleMetrics(); // immediate first sample so the chart isn't empty for up to 30 min
  // Align the recurring sample to the next :00/:30 boundary, then every 30 min.
  setTimeout(() => {
    void sampleMetrics();
    setInterval(() => void sampleMetrics(), HALF_HOUR_MS);
  }, HALF_HOUR_MS - (Date.now() % HALF_HOUR_MS));

  const sensors = CHILLS.filter((c) => c.waterSensor).map((c) => ({ id: c.waterSensor as string, name: c.name }));
  if (sensors.length === 0) return;

  let prev: Record<string, boolean> = {};
  let seeded = false;
  let alertActive = false; // we currently have a water alert shown on the LaMetric

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
    const cleared = allCleared(prev, current);
    prev = current;

    const settings = getSettings();
    if (newly.length > 0 && settings.waterAlert) {
      for (const id of newly) {
        const room = sensors.find((s) => s.id === id)?.name ?? "";
        try {
          await callService(WATER_ALERT.notifyDomain, WATER_ALERT.notifyService, waterAlertNotify(room, settings.language));
          alertActive = true;
        } catch {
          // HA unreachable / notify failed — skip; next transition will try again
        }
      }
    }

    // Once every tank is empty again, clear the alert we put up.
    if (cleared && alertActive) {
      try {
        await callService("button", "press", { entity_id: WATER_ALERT.dismissEntity });
        alertActive = false;
      } catch {
        // try again next tick
      }
    }
  }

  setInterval(() => void tick(), 30_000);
}
