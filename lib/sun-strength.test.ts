import { describe, it, expect } from "vitest";
import {
  buildClearSkyEnvelope, clearSkyReference, productionCloudCoverage, blendCoverage,
  applySunStrength,
  type ClearSkyEnvelope,
} from "@/lib/sun-strength";
import type { StatPoint } from "@/lib/ha-stats";
import type { SolarState } from "@/lib/types";

// Build an hourly StatPoint at a given UTC day + hour with a `max` watt value.
function pt(dayUtc: string, hour: number, max: number | null): StatPoint {
  const start = Date.parse(`${dayUtc}T${String(hour).padStart(2, "0")}:00:00Z`);
  return { start, end: start + 3_600_000, change: null, max };
}

describe("buildClearSkyEnvelope", () => {
  it("takes the per-hour maximum across days and counts distinct days", () => {
    const points = [
      pt("2026-06-24", 12, 1800), pt("2026-06-25", 12, 2284), pt("2026-06-26", 12, 900),
      pt("2026-06-24", 18, 1304),
    ];
    const env = buildClearSkyEnvelope(points, "UTC");
    expect(env.hourMaxW[12]).toBe(2284);
    expect(env.hourMaxW[18]).toBe(1304);
    expect(env.hourMaxW[3]).toBeNull();
    expect(env.days).toBe(3);
    expect(env.tz).toBe("UTC");
  });

  it("ignores null/non-finite max values", () => {
    const env = buildClearSkyEnvelope([pt("2026-06-24", 10, null), pt("2026-06-24", 10, 500)], "UTC");
    expect(env.hourMaxW[10]).toBe(500);
  });
});

describe("clearSkyReference", () => {
  const env: ClearSkyEnvelope = { hourMaxW: new Array(24).fill(null), days: 14, tz: "UTC" };
  env.hourMaxW[18] = 1304;
  env.hourMaxW[19] = 719;

  it("interpolates between the two surrounding hours", () => {
    // 18:42 UTC → fraction 0.7 between hour 18 (1304) and 19 (719)
    const at = Date.parse("2026-06-26T18:42:00Z");
    const ref = clearSkyReference(env, at);
    expect(ref).toBeCloseTo(1304 + (719 - 1304) * 0.7, 0); // ≈ 894.5
  });

  it("returns null below the reference floor (low sun)", () => {
    const low: ClearSkyEnvelope = { hourMaxW: new Array(24).fill(null), days: 14, tz: "UTC" };
    low.hourMaxW[5] = 90; low.hourMaxW[6] = 100;
    expect(clearSkyReference(low, Date.parse("2026-06-26T05:30:00Z"))).toBeNull();
  });

  it("returns null when both surrounding hours are empty", () => {
    expect(clearSkyReference(env, Date.parse("2026-06-26T03:30:00Z"))).toBeNull();
  });
});

describe("productionCloudCoverage", () => {
  it("returns a sunny coverage when production is near the clear-sky reference", () => {
    expect(productionCloudCoverage(1000, 1200)).toBe(20); // ratio .83 ≥ .75
  });
  it("returns a partly-cloudy coverage at a middling ratio", () => {
    expect(productionCloudCoverage(579, 1000)).toBe(55); // ratio .58
  });
  it("returns null (no opinion) when production is low", () => {
    expect(productionCloudCoverage(200, 1000)).toBeNull(); // ratio .20
  });
  it("returns null when inputs are missing", () => {
    expect(productionCloudCoverage(null, 1000)).toBeNull();
    expect(productionCloudCoverage(500, null)).toBeNull();
  });
  it("treats the exact sunny boundary (ratio 0.75) as sunny", () => {
    expect(productionCloudCoverage(750, 1000)).toBe(20);
  });
  it("treats the exact partly boundary (ratio 0.45) as partly-cloudy", () => {
    expect(productionCloudCoverage(450, 1000)).toBe(55);
  });
});

describe("blendCoverage", () => {
  it("takes the brighter (lower) of the two", () => {
    expect(blendCoverage(93, 20)).toBe(20);
    expect(blendCoverage(30, 55)).toBe(30); // production never darkens
  });
  it("falls back when one side is null", () => {
    expect(blendCoverage(null, 20)).toBe(20);
    expect(blendCoverage(93, null)).toBe(93);
  });
});

function solarFixture(over: Partial<SolarState> = {}, sky: Partial<SolarState["sky"]> = {}): SolarState {
  return {
    available: true, currentPowerW: 600, netGridKw: null, gridDirection: "idle",
    coveragePct: 29, lifetimeKwh: null,
    sky: { condition: "partly-cloudy", isDay: true, cloudCoverage: 93, raw: "partlycloudy", ...sky },
    ...over,
  };
}
// Envelope whose interpolated reference at any daytime hour is ~1300 W.
function flatEnvelope(maxW: number, days = 14): ClearSkyEnvelope {
  return { hourMaxW: new Array(24).fill(maxW), days, tz: "UTC" };
}

describe("applySunStrength", () => {
  const noon = Date.parse("2026-06-26T12:00:00Z");

  it("brightens a pessimistic forecast when production proves strong sun", () => {
    const solar = solarFixture({ currentPowerW: 1200 }, { cloudCoverage: 93 }); // ratio .92 → 20
    applySunStrength(solar, flatEnvelope(1300), noon);
    expect(solar.sky.cloudCoverage).toBe(20);
  });

  it("never darkens an already-sunny forecast", () => {
    const solar = solarFixture({ currentPowerW: 700 }, { cloudCoverage: 10 }); // production → 55, but min(10,55)=10
    applySunStrength(solar, flatEnvelope(1300), noon);
    expect(solar.sky.cloudCoverage).toBe(10);
  });

  it("does nothing for wet conditions (never hides rain)", () => {
    const solar = solarFixture({ currentPowerW: 1300 }, { condition: "rain", cloudCoverage: 93 });
    applySunStrength(solar, flatEnvelope(1300), noon);
    expect(solar.sky.cloudCoverage).toBe(93);
  });

  it("does nothing when the envelope is null or too thin", () => {
    const a = solarFixture({ currentPowerW: 1300 });
    applySunStrength(a, null, noon);
    expect(a.sky.cloudCoverage).toBe(93);
    const b = solarFixture({ currentPowerW: 1300 });
    applySunStrength(b, flatEnvelope(1300, 2), noon); // days 2 < minDays 3
    expect(b.sky.cloudCoverage).toBe(93);
  });

  it("regression: live scenario lands partly-cloudy, not grey, not full sun", () => {
    // forecast 93 %, production 579 W; reference interpolated(1304@18, 719@19) ≈ 894 → ratio ≈ .65 → 55
    const env: ClearSkyEnvelope = { hourMaxW: new Array(24).fill(null), days: 14, tz: "UTC" };
    env.hourMaxW[18] = 1304; env.hourMaxW[19] = 719;
    const solar = solarFixture({ currentPowerW: 579 }, { cloudCoverage: 93 });
    applySunStrength(solar, env, Date.parse("2026-06-26T18:42:00Z"));
    expect(solar.sky.cloudCoverage).toBe(55); // partly-cloudy band
  });
});
