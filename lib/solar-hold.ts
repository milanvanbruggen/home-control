import type { SolarState } from "@/lib/types";

// Hold the last-good SolarEdge production fields across polls so a brief SolarEdge
// `unavailable` dropout (the integration flaps every couple hours for ~15 min) does
// not blank the whole Solar card. Module-level in-memory state: a single Node
// process (the add-on / dev server), shared across visitor devices, reset on restart
// (then no hold until solar is next seen available). Mirrors lib/chill-mode.ts.

/** How long a last-good snapshot may be served before we show the honest "Unavailable". */
export const SOLAR_HOLD_WINDOW_MS = 30 * 60 * 1000;

type Snapshot = { currentPowerW: number | null; lifetimeKwh: number | null; at: number };

let snapshot: Snapshot | null = null;

/** Snapshot the SolarEdge-derived fields when available; restore them (re-flagging
 *  `available`) during a fresh full dropout. Only `currentPowerW`/`lifetimeKwh` are
 *  held — `sky`, `netGridKw`, and `coveragePct` come from sensors that stay live, so
 *  they are left as freshly mapped. Mutates `solar` in place. */
export function applySolarHold(solar: SolarState, nowMs: number, windowMs: number = SOLAR_HOLD_WINDOW_MS): void {
  if (solar.available) {
    snapshot = { currentPowerW: solar.currentPowerW, lifetimeKwh: solar.lifetimeKwh, at: nowMs };
    return;
  }
  if (snapshot && nowMs - snapshot.at <= windowMs) {
    solar.currentPowerW = snapshot.currentPowerW;
    solar.lifetimeKwh = snapshot.lifetimeKwh;
    // The snapshot is only ever taken while solar was available, so at least one of
    // these is non-null — `available` resolves back to true here.
    solar.available = solar.currentPowerW != null || solar.lifetimeKwh != null;
  }
}

/** Reset the held snapshot — for test isolation. */
export function clearSolarHold(): void {
  snapshot = null;
}
