// Runs once on server start (Next instrumentation hook). Polls the Quatt water
// sensors and sends a Web Push when one transitions to "warning". Node runtime only.

export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const g = globalThis as unknown as { __waterWatchStarted?: boolean };
  if (g.__waterWatchStarted) return; // survive dev HMR re-runs
  g.__waterWatchStarted = true;

  const [{ getStates }, { CHILLS }, { roomsNewlyWarning }, { sendPushToAll, listSubscriptions }, { getSettings }, { t }] =
    await Promise.all([
      import("@/lib/ha-client"),
      import("@/config/devices"),
      import("@/lib/water-watch"),
      import("@/lib/push-store"),
      import("@/lib/settings-store"),
      import("@/lib/i18n"),
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
      // First reading just establishes the baseline — don't notify for tanks
      // that were already full when the server (re)started.
      prev = current;
      seeded = true;
      return;
    }

    const newly = roomsNewlyWarning(prev, current);
    prev = current;
    if (newly.length === 0 || listSubscriptions().length === 0) return;

    const { language } = getSettings();
    for (const id of newly) {
      const room = sensors.find((s) => s.id === id)?.name ?? "";
      try {
        await sendPushToAll({
          title: t(language, "settings.waterPushTitle"),
          body: t(language, "settings.waterPushBody", { room }),
          tag: `water-${id}`,
          url: "/",
        });
      } catch {
        // sendPushToAll already swallows per-subscription errors
      }
    }
  }

  setInterval(() => void tick(), 30_000);
}
