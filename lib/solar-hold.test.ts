import { describe, it, expect, beforeEach } from "vitest";
import { applySolarHold, clearSolarHold, SOLAR_HOLD_WINDOW_MS } from "@/lib/solar-hold";
import type { SolarState } from "@/lib/types";

function solar(over: Partial<SolarState> = {}): SolarState {
  return {
    available: true, currentPowerW: 1390, netGridKw: 0.2, gridDirection: "import",
    coveragePct: 23, lifetimeKwh: 5000,
    sky: { condition: "partly-cloudy", isDay: true, cloudCoverage: 40, raw: "partlycloudy" },
    ...over,
  };
}
// A fully-unavailable solar map (both SolarEdge sensors null), as mapSolar would produce.
function unavailable(over: Partial<SolarState> = {}): SolarState {
  return solar({ available: false, currentPowerW: null, lifetimeKwh: null, ...over });
}

beforeEach(() => clearSolarHold());

describe("applySolarHold", () => {
  const t0 = 1_000_000_000_000;

  it("snapshots when available and leaves the solar unchanged", () => {
    const s = solar({ currentPowerW: 1390, lifetimeKwh: 5000 });
    applySolarHold(s, t0);
    expect(s.currentPowerW).toBe(1390);
    expect(s.available).toBe(true);
  });

  it("restores held power + lifetime and re-flags available during a fresh dropout", () => {
    applySolarHold(solar({ currentPowerW: 1390, lifetimeKwh: 5000 }), t0); // seed
    const dip = unavailable();
    applySolarHold(dip, t0 + 60_000); // 1 min later
    expect(dip.available).toBe(true);
    expect(dip.currentPowerW).toBe(1390);
    expect(dip.lifetimeKwh).toBe(5000);
  });

  it("does NOT restore once the snapshot is older than the window", () => {
    applySolarHold(solar({ currentPowerW: 1390 }), t0); // seed
    const dip = unavailable();
    applySolarHold(dip, t0 + SOLAR_HOLD_WINDOW_MS + 1); // just past the window
    expect(dip.available).toBe(false);
    expect(dip.currentPowerW).toBeNull();
  });

  it("does nothing on a cold start (no snapshot yet)", () => {
    const dip = unavailable();
    applySolarHold(dip, t0);
    expect(dip.available).toBe(false);
    expect(dip.currentPowerW).toBeNull();
  });

  it("leaves live fields (sky, net, coverage) untouched when restoring", () => {
    applySolarHold(solar({ currentPowerW: 1390, lifetimeKwh: 5000 }), t0); // seed
    const dip = unavailable({ netGridKw: 0.9, coveragePct: 10, sky: { condition: "cloudy", isDay: true, cloudCoverage: 95, raw: "cloudy" } });
    applySolarHold(dip, t0 + 60_000);
    expect(dip.netGridKw).toBe(0.9);        // P1 net stays fresh
    expect(dip.coveragePct).toBe(10);       // coverage stays fresh
    expect(dip.sky.condition).toBe("cloudy"); // backdrop stays fresh
  });
});
