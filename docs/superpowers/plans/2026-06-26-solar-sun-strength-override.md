# Solar "Strong Sun" Backdrop Override — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Brighten the Solar card's weather backdrop when panel production proves the sun is actually out, overriding an over-pessimistic `weather.forecast_home`.

**Architecture:** A self-calibrating clear-sky reference (14-day per-hour max production) is built from HA statistics and cached (1 h TTL, stale-while-revalidate). On each `/api/state` poll, current production is compared to that reference; a strong ratio lowers the *effective* cloud coverage written into `solar.sky.cloudCoverage`. The existing client mapper (`resolveSkyVisual` → `conditionFromCoverage`) is reused unchanged. The blend is brighten-only (`min`) and applies only to dry conditions, so precipitation is never hidden.

**Tech Stack:** TypeScript, Next.js (App Router), Vitest. HA long-term statistics over WebSocket (`recorder/statistics_during_period`).

## Global Constraints

- **Brighten-only:** production may lower effective cloud coverage, never raise it. `effective = min(forecast, production)`.
- **Dry conditions only:** override applies only to `sunny | partly-cloudy | cloudy` (the existing `COVERAGE_DRIVEN` set). Never `rain | pouring | fog | snow | sleet | thunder | unknown`.
- **No new config / entities:** detection is self-calibrating; no kWp, no astronomy, no env flags.
- **Degrade safely:** any failure (no history, stats error, cold start) → no override → behaviour identical to today. The override must never block or slow the 3 s state poll.
- **Coverage stat untouched:** `solar.coveragePct` (`sensor.home_solar_percentage`) is unrelated and must not change.
- **Tunables in one place:** `SUN_STRENGTH = { windowDays: 14, sunnyRatio: 0.75, partlyRatio: 0.45, referenceFloorW: 200, minDays: 3, ttlMs: 3_600_000 }`.
- Test command: `npm test` (vitest run). Lint: `npm run lint`. Build: `npm run build`.

## File Structure

- `lib/ha-stats.ts` (modify) — `getStatistics` gains an optional `types` param and `StatPoint.max`.
- `lib/sky-visuals.ts` (modify) — export the existing `COVERAGE_DRIVEN` set for reuse.
- `lib/sun-strength.ts` (create) — pure math (envelope, reference, ratio→coverage, blend), `applySunStrength`, and the cached `getClearSkyEnvelope` provider + test hooks.
- `lib/sun-strength.test.ts` (create) — unit tests for all of the above.
- `app/api/state/route.ts` (modify) — fetch the cached envelope and apply the override after mapping.
- `app/api/state/route.test.ts` (modify) — integration test that the override brightens a pessimistic forecast.

---

### Task 1: `getStatistics` — support the `max` statistic type

**Files:**
- Modify: `lib/ha-stats.ts`
- Test: `lib/ha-stats.test.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces:
  - `interface StatPoint { start: number; end: number; change: number | null; max?: number | null }`
  - `type StatType = "change" | "max" | "mean" | "min" | "sum" | "state"`
  - `getStatistics(ids: string[], startISO: string, endISO: string, period: "hour" | "day" | "month", opts?: { connect?: Connect; timeoutMs?: number; types?: StatType[] }): Promise<Record<string, StatPoint[]>>` — default `types` is `["change"]` (unchanged behaviour). When `max` is requested, each returned `StatPoint` carries `max`.

- [ ] **Step 1: Write the failing test**

Add to `lib/ha-stats.test.ts` inside the `describe("getStatistics", ...)` block:

```ts
  it("requests the given statistic types and maps max points", async () => {
    const ws = fakeWS();
    const p = getStatistics(["sensor.p"], "2026-06-12T00:00:00Z", "2026-06-26T00:00:00Z", "hour", { connect: () => ws, types: ["max"] });
    emit(ws, { type: "auth_required" });
    emit(ws, { type: "auth_ok" });
    const cmd = JSON.parse(ws.sent[1]);
    expect(cmd).toMatchObject({ type: "recorder/statistics_during_period", period: "hour", statistic_ids: ["sensor.p"], types: ["max"] });
    emit(ws, { id: cmd.id, type: "result", success: true, result: {
      "sensor.p": [{ start: 1782424800000, end: 1782428400000, max: 1304 }],
    } });
    const result = await p;
    expect(result["sensor.p"][0].max).toBe(1304);
    expect(result["sensor.p"][0].start).toBe(1782424800000);
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- ha-stats`
Expected: FAIL — the new test errors because `opts.types` is ignored (command still sends `types: ["change"]`) and `max` is not mapped onto the result.

- [ ] **Step 3: Implement the change**

In `lib/ha-stats.ts`, update the `StatPoint` interface to add `max`:

```ts
export interface StatPoint {
  /** epoch ms — HA recorder/statistics_during_period returns ms; coerced defensively from seconds or ISO strings */
  start: number;
  /** epoch ms — HA recorder/statistics_during_period returns ms; coerced defensively from seconds or ISO strings */
  end: number;
  change: number | null;
  /** present only when the caller requests the `max` type */
  max?: number | null;
}

export type StatType = "change" | "max" | "mean" | "min" | "sum" | "state";
```

Update the `getStatistics` signature to accept `types`:

```ts
export function getStatistics(
  ids: string[],
  startISO: string,
  endISO: string,
  period: "hour" | "day" | "month",
  opts: { connect?: Connect; timeoutMs?: number; types?: StatType[] } = {},
): Promise<Record<string, StatPoint[]>> {
  const types = opts.types ?? ["change"];
  const connect: Connect = opts.connect ?? ((url) => new WebSocket(url) as unknown as WSLike);
  const ws = connect(wsBaseUrl());
```

Change the request payload (the `auth_ok` branch) to send `types`:

```ts
      if (m.type === "auth_ok") {
        ws.send(JSON.stringify({ id: 1, type: "recorder/statistics_during_period", start_time: startISO, end_time: endISO, period, statistic_ids: ids, types }));
        return;
      }
```

Widen the inline result type and map `max` only when present (so existing `change`-only callers and their `toEqual` assertions are unaffected):

```ts
      let m: { type?: string; success?: boolean; result?: Record<string, Array<{ start: number | string; end: number | string; change?: number | null; max?: number | null }>> };
```

```ts
        for (const id of Object.keys(r)) {
          out[id] = r[id].map((p) => {
            const sp: StatPoint = { start: toEpochMs(p.start), end: toEpochMs(p.end), change: p.change ?? null };
            if (p.max !== undefined) sp.max = p.max ?? null;
            return sp;
          });
        }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- ha-stats`
Expected: PASS — all existing `getStatistics` tests still pass (default `types: ["change"]`, no `max` key added to change-only points) plus the new `max` test.

- [ ] **Step 5: Commit**

```bash
git add lib/ha-stats.ts lib/ha-stats.test.ts
git commit -m "feat(stats): let getStatistics request the max statistic type"
```

---

### Task 2: `sun-strength` pure core — envelope, reference, ratio→coverage, blend

**Files:**
- Create: `lib/sun-strength.ts`
- Test: `lib/sun-strength.test.ts`

**Interfaces:**
- Consumes: `StatPoint` from `@/lib/ha-stats` (Task 1).
- Produces:
  - `const SUN_STRENGTH = { windowDays: 14, sunnyRatio: 0.75, partlyRatio: 0.45, referenceFloorW: 200, minDays: 3, ttlMs: 3_600_000 } as const`
  - `interface ClearSkyEnvelope { hourMaxW: (number | null)[]; days: number; tz: string }` (`hourMaxW` length 24, indexed by local hour-of-day in `tz`)
  - `buildClearSkyEnvelope(points: StatPoint[], tz: string): ClearSkyEnvelope`
  - `clearSkyReference(env: ClearSkyEnvelope, atMs: number, floorW?: number): number | null`
  - `productionCloudCoverage(currentW: number | null, reference: number | null): number | null`
  - `blendCoverage(forecast: number | null, production: number | null): number | null`

- [ ] **Step 1: Write the failing tests**

Create `lib/sun-strength.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  buildClearSkyEnvelope, clearSkyReference, productionCloudCoverage, blendCoverage,
  type ClearSkyEnvelope,
} from "@/lib/sun-strength";
import type { StatPoint } from "@/lib/ha-stats";

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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- sun-strength`
Expected: FAIL — `lib/sun-strength.ts` does not exist (module not found).

- [ ] **Step 3: Implement the pure core**

Create `lib/sun-strength.ts`:

```ts
import type { StatPoint } from "@/lib/ha-stats";

/** Tunables for the production-driven "strong sun" backdrop override. */
export const SUN_STRENGTH = {
  windowDays: 14,
  sunnyRatio: 0.75,
  partlyRatio: 0.45,
  referenceFloorW: 200,
  minDays: 3,
  ttlMs: 3_600_000,
} as const;

/** A self-calibrating clear-sky curve: the recent max production per local hour-of-day. */
export interface ClearSkyEnvelope {
  /** Length 24. Max production (W) seen at each local hour-of-day, or null if no data. */
  hourMaxW: (number | null)[];
  /** Distinct days that contributed (for the minDays guard). */
  days: number;
  /** IANA timezone the hours are bucketed in. */
  tz: string;
}

function hourInTz(ms: number, tz: string): number {
  return Number(new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", hourCycle: "h23" }).format(new Date(ms)));
}
function hourFractionInTz(ms: number, tz: string): number {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date(ms));
  const h = Number(parts.find((p) => p.type === "hour")!.value);
  const m = Number(parts.find((p) => p.type === "minute")!.value);
  return h + m / 60;
}
function dayKeyInTz(ms: number, tz: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(ms));
}

/** Build the per-hour clear-sky envelope from hourly `max` statistics points. */
export function buildClearSkyEnvelope(points: StatPoint[], tz: string): ClearSkyEnvelope {
  const hourMaxW: (number | null)[] = new Array(24).fill(null);
  const days = new Set<string>();
  for (const p of points) {
    const w = p.max;
    if (w == null || !Number.isFinite(w)) continue;
    const h = hourInTz(p.start, tz);
    if (h < 0 || h > 23) continue;
    const cur = hourMaxW[h];
    hourMaxW[h] = cur == null ? w : Math.max(cur, w);
    days.add(dayKeyInTz(p.start, tz));
  }
  return { hourMaxW, days: days.size, tz };
}

/** Interpolated clear-sky reference (W) at `atMs`, or null if below the low-sun floor / no data. */
export function clearSkyReference(env: ClearSkyEnvelope, atMs: number, floorW: number = SUN_STRENGTH.referenceFloorW): number | null {
  const hf = hourFractionInTz(atMs, env.tz);
  const h0 = Math.floor(hf) % 24;
  const h1 = (h0 + 1) % 24;
  const f = hf - Math.floor(hf);
  const a = env.hourMaxW[h0];
  const b = env.hourMaxW[h1];
  let ref: number | null;
  if (a == null && b == null) ref = null;
  else if (a == null) ref = b;
  else if (b == null) ref = a;
  else ref = a + (b - a) * f;
  if (ref == null || ref < floorW) return null;
  return ref;
}

/** Map current production vs the clear-sky reference to an *implied* cloud coverage (0–100), or
 *  null for "no opinion" (keep the forecast). 20 → sunny, 55 → partly-cloudy via conditionFromCoverage. */
export function productionCloudCoverage(currentW: number | null, reference: number | null): number | null {
  if (currentW == null || reference == null || reference <= 0) return null;
  const ratio = currentW / reference;
  if (ratio >= SUN_STRENGTH.sunnyRatio) return 20;
  if (ratio >= SUN_STRENGTH.partlyRatio) return 55;
  return null;
}

/** Brighten-only blend: the lower (sunnier) of forecast vs production coverage, null-aware. */
export function blendCoverage(forecast: number | null, production: number | null): number | null {
  if (forecast == null) return production;
  if (production == null) return forecast;
  return Math.min(forecast, production);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- sun-strength`
Expected: PASS — all `buildClearSkyEnvelope` / `clearSkyReference` / `productionCloudCoverage` / `blendCoverage` tests green.

- [ ] **Step 5: Commit**

```bash
git add lib/sun-strength.ts lib/sun-strength.test.ts
git commit -m "feat(solar): clear-sky envelope + ratio→coverage math"
```

---

### Task 3: `applySunStrength` — apply the brighten-only override (dry conditions only)

**Files:**
- Modify: `lib/sky-visuals.ts` (export `COVERAGE_DRIVEN`)
- Modify: `lib/sun-strength.ts` (add `applySunStrength`)
- Test: `lib/sun-strength.test.ts` (add cases)

**Interfaces:**
- Consumes: `COVERAGE_DRIVEN` from `@/lib/sky-visuals`; `SolarState` from `@/lib/types`; the Task 2 functions.
- Produces:
  - `applySunStrength(solar: SolarState, envelope: ClearSkyEnvelope | null, atMs: number, opts?: { floorW?: number; minDays?: number }): void` — mutates `solar.sky.cloudCoverage` in place; no-op when the envelope is null/too thin, the condition is not dry, or production gives no opinion.

- [ ] **Step 1: Export `COVERAGE_DRIVEN`**

In `lib/sky-visuals.ts`, add `export` to the existing constant (line ~49):

```ts
export const COVERAGE_DRIVEN: ReadonlySet<SkyCondition> = new Set(["sunny", "partly-cloudy", "cloudy"]);
```

- [ ] **Step 2: Write the failing tests**

Add to `lib/sun-strength.test.ts`:

```ts
import { applySunStrength } from "@/lib/sun-strength";
import type { SolarState } from "@/lib/types";

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
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npm test -- sun-strength`
Expected: FAIL — `applySunStrength` is not exported yet.

- [ ] **Step 4: Implement `applySunStrength`**

In `lib/sun-strength.ts`, add the import at the top and the function at the bottom:

```ts
import type { SolarState } from "@/lib/types";
import { COVERAGE_DRIVEN } from "@/lib/sky-visuals";
```

```ts
/** Brighten `solar.sky.cloudCoverage` when production indicates clearer skies than the forecast.
 *  Dry conditions only, brighten-only, no-op on missing/thin data. Mutates `solar` in place. */
export function applySunStrength(
  solar: SolarState,
  envelope: ClearSkyEnvelope | null,
  atMs: number,
  opts: { floorW?: number; minDays?: number } = {},
): void {
  const floorW = opts.floorW ?? SUN_STRENGTH.referenceFloorW;
  const minDays = opts.minDays ?? SUN_STRENGTH.minDays;
  if (!envelope || envelope.days < minDays) return;
  if (!COVERAGE_DRIVEN.has(solar.sky.condition)) return;
  const reference = clearSkyReference(envelope, atMs, floorW);
  const production = productionCloudCoverage(solar.currentPowerW, reference);
  if (production == null) return;
  solar.sky.cloudCoverage = blendCoverage(solar.sky.cloudCoverage, production);
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test -- sun-strength`
Expected: PASS — including the live-scenario regression (579 W → coverage 55 → partly-cloudy).

- [ ] **Step 6: Commit**

```bash
git add lib/sky-visuals.ts lib/sun-strength.ts lib/sun-strength.test.ts
git commit -m "feat(solar): brighten-only sun-strength override (dry conditions)"
```

---

### Task 4: Cached `getClearSkyEnvelope` provider (TTL + stale-while-revalidate)

**Files:**
- Modify: `lib/sun-strength.ts`
- Test: `lib/sun-strength.test.ts`

**Interfaces:**
- Consumes: `getStatistics` (Task 1); `SOLAR.currentPower` from `@/config/devices`.
- Produces:
  - `getClearSkyEnvelope(): Promise<ClearSkyEnvelope | null>` — cold start returns `null` and warms in the background (never blocks); subsequently returns the cached envelope and refreshes after `ttlMs`.
  - Test hooks: `_setStatsProvider(fn: StatsProvider | null): void`, `_setSunEnvelope(env: ClearSkyEnvelope | null): void`, `_resetSunCache(): void`, where `type StatsProvider = (ids: string[], startISO: string, endISO: string) => Promise<Record<string, StatPoint[]>>`.

- [ ] **Step 1: Write the failing tests**

Add to `lib/sun-strength.test.ts`:

```ts
import { getClearSkyEnvelope, _setStatsProvider, _setSunEnvelope, _resetSunCache } from "@/lib/sun-strength";
import { afterEach } from "vitest";
import { SOLAR } from "@/config/devices";

describe("getClearSkyEnvelope", () => {
  afterEach(() => { _resetSunCache(); _setStatsProvider(null); });

  it("returns null on cold start, then the built envelope once warmed", async () => {
    _setStatsProvider(async () => ({
      [SOLAR.currentPower]: [
        { start: Date.parse("2026-06-25T12:00:00Z"), end: 0, change: null, max: 2000 },
        { start: Date.parse("2026-06-24T12:00:00Z"), end: 0, change: null, max: 1500 },
        { start: Date.parse("2026-06-23T12:00:00Z"), end: 0, change: null, max: 1800 },
      ],
    }));
    expect(await getClearSkyEnvelope()).toBeNull();      // cold start, warms in background
    await new Promise((r) => setTimeout(r));             // let refresh settle
    const env = await getClearSkyEnvelope();
    expect(env?.days).toBe(3);
    expect(env?.hourMaxW[12]).toBe(2000);
  });

  it("degrades to null when the stats provider throws", async () => {
    _setStatsProvider(async () => { throw new Error("ws down"); });
    expect(await getClearSkyEnvelope()).toBeNull();
    await new Promise((r) => setTimeout(r));
    expect(await getClearSkyEnvelope()).toBeNull();
  });

  it("serves a directly-seeded envelope (test hook)", async () => {
    _setSunEnvelope({ hourMaxW: new Array(24).fill(1000), days: 14, tz: "UTC" });
    const env = await getClearSkyEnvelope();
    expect(env?.days).toBe(14);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- sun-strength`
Expected: FAIL — `getClearSkyEnvelope` / the test hooks are not exported.

- [ ] **Step 3: Implement the cached provider**

In `lib/sun-strength.ts`, add the import and append the provider:

```ts
import { getStatistics } from "@/lib/ha-stats";
import { SOLAR } from "@/config/devices";
```

```ts
type StatsProvider = (ids: string[], startISO: string, endISO: string) => Promise<Record<string, StatPoint[]>>;
const defaultStatsProvider: StatsProvider = (ids, startISO, endISO) =>
  getStatistics(ids, startISO, endISO, "hour", { types: ["max"] });
let statsProvider: StatsProvider = defaultStatsProvider;

let cache: ClearSkyEnvelope | null = null;
let fetchedAt = 0;
let inflight: Promise<void> | null = null;

function serverTz(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
}

async function refresh(): Promise<void> {
  try {
    const now = Date.now();
    const startISO = new Date(now - SUN_STRENGTH.windowDays * 86_400_000).toISOString();
    const endISO = new Date(now).toISOString();
    const stats = await statsProvider([SOLAR.currentPower], startISO, endISO);
    cache = buildClearSkyEnvelope(stats[SOLAR.currentPower] ?? [], serverTz());
    fetchedAt = Date.now();
  } catch {
    // keep the last good cache; mark the attempt so we back off until the TTL.
    fetchedAt = Date.now();
  }
}

/** Cached clear-sky envelope. Cold start returns null and warms in the background (never blocks
 *  the state poll); later calls serve the cache and refresh once stale. */
export async function getClearSkyEnvelope(): Promise<ClearSkyEnvelope | null> {
  if (fetchedAt === 0) {
    inflight ??= refresh().finally(() => { inflight = null; });
    return cache; // null this round
  }
  if (Date.now() - fetchedAt > SUN_STRENGTH.ttlMs && !inflight) {
    inflight = refresh().finally(() => { inflight = null; });
  }
  return cache;
}

/** Test hooks. */
export function _setStatsProvider(fn: StatsProvider | null): void { statsProvider = fn ?? defaultStatsProvider; }
export function _setSunEnvelope(env: ClearSkyEnvelope | null): void { cache = env; fetchedAt = env ? Date.now() : 0; }
export function _resetSunCache(): void { cache = null; fetchedAt = 0; inflight = null; }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- sun-strength`
Expected: PASS — cold-start→warm, throw→null, and seeded-envelope cases all green.

- [ ] **Step 5: Commit**

```bash
git add lib/sun-strength.ts lib/sun-strength.test.ts
git commit -m "feat(solar): cached clear-sky envelope provider (TTL + SWR)"
```

---

### Task 5: Wire the override into `/api/state`

**Files:**
- Modify: `app/api/state/route.ts`
- Test: `app/api/state/route.test.ts`

**Interfaces:**
- Consumes: `getClearSkyEnvelope`, `applySunStrength`, `_setSunEnvelope`, `_resetSunCache` from `@/lib/sun-strength`.
- Produces: `/api/state` response whose `solar.sky.cloudCoverage` is the brightened value when production proves strong sun.

- [ ] **Step 1: Write the failing test**

Add to `app/api/state/route.test.ts` (the existing `@/lib/ha-client` mock and imports stay):

```ts
import { _setSunEnvelope, _resetSunCache } from "@/lib/sun-strength";
```

```ts
  it("brightens solar.sky.cloudCoverage when production proves strong sun", async () => {
    _setSunEnvelope({ hourMaxW: new Array(24).fill(1300), days: 14, tz: "UTC" });
    (getStates as any).mockResolvedValue([
      { entity_id: "weather.forecast_home", state: "partlycloudy", attributes: { cloud_coverage: 93 } },
      { entity_id: "sun.sun", state: "above_horizon", attributes: {} },
      { entity_id: "sensor.solaredge_current_power", state: "1200", attributes: {} },
    ]);
    const res = await GET();
    const body = await res.json();
    expect(body.solar.sky.cloudCoverage).toBe(20); // min(93, production-implied 20)
    _resetSunCache();
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- "api/state"`
Expected: FAIL — `solar.sky.cloudCoverage` is still 93 (override not wired in).

- [ ] **Step 3: Wire the override into the route**

In `app/api/state/route.ts`, add the imports:

```ts
import { getClearSkyEnvelope, applySunStrength } from "@/lib/sun-strength";
```

Add `getClearSkyEnvelope()` to the parallel fetch and apply the override after mapping (before `Response.json(app)`):

```ts
    const [states, sceneGradients, envelope] = await Promise.all([getStates(), getSceneGradients(), getClearSkyEnvelope()]);
    const activeScenes = Object.fromEntries(ROOMS.map((r) => [r.key, getActiveScene(r.key)]));
    const settings = getSettings();
    const app = mapHaStatesToAppState(states, activeScenes, settings.favorites, sceneGradients, settings.hiddenMetrics);
    // Brighten the weather backdrop when the panels prove the sun is actually out
    // (forecast cloud coverage is often too pessimistic). No-op without history.
    applySunStrength(app.solar, envelope, Date.now());
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- "api/state"`
Expected: PASS — the brighten test returns coverage 20; all existing `/api/state` tests still pass (cold-start envelope is null → override is a no-op for them).

- [ ] **Step 5: Full verification — suite, lint, build**

Run: `npm test`
Expected: PASS — entire suite green.

Run: `npm run lint`
Expected: no errors.

Run: `npm run build`
Expected: build succeeds (type check passes).

- [ ] **Step 6: Manual end-to-end check (verify skill)**

Start the dev server (`npm run dev`) against the live HA (`.env.local`) and inspect the live override:

```bash
curl -s localhost:3000/api/state | node -e 'const s=JSON.parse(require("fs").readFileSync(0)).solar; console.log("condition:", s.sky.condition, "| cloudCoverage(after override):", s.sky.cloudCoverage, "| powerW:", s.currentPowerW)'
```

Expected: on a day where production is strong relative to the recent best at this hour, `cloudCoverage` is lower than the raw `weather.forecast_home` `cloud_coverage` (the backdrop is no longer full grey). On a genuinely overcast hour it is unchanged. Open the app and confirm the Solar card backdrop matches reality.

- [ ] **Step 7: Commit**

```bash
git add app/api/state/route.ts app/api/state/route.test.ts
git commit -m "feat(solar): apply sun-strength backdrop override in /api/state"
```

---

## Notes for the implementer

- **Timezone:** the envelope buckets hours in the server's resolved timezone (`Intl…resolvedOptions().timeZone`). On the Home Assistant add-on the server runs in the home's timezone, so this matches the production pattern. In dev it is the dev machine's zone — acceptable; the override only ever brightens, so a small bucketing offset cannot hide rain or darken the card.
- **Why cold start returns null (non-blocking):** unlike `getSceneGradients` (which awaits inline), the backdrop override is non-critical and must never add latency to the 3 s state poll. Returning null for the first poll after boot and warming in the background is the safe trade-off.
- **Inverter clipping** on the very clearest days slightly inflates a given hour's max, which makes the override marginally *more* conservative (higher reference → lower ratio). Safe by construction.
- **Tuning:** if the backdrop feels too eager or too shy in practice, adjust `SUN_STRENGTH.sunnyRatio` / `partlyRatio` (and `referenceFloorW` for the low-sun cutoff) in `lib/sun-strength.ts` — single source of truth.
