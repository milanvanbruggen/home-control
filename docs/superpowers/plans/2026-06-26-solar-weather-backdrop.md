# Solar Weather Backdrop Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Solar card's background a live weather-driven "sky" (sunny / cloudy / rain / snow / night) with a subtle animated companion, while keeping all production data fully legible.

**Architecture:** A normalized `sky` is computed from `weather.forecast_home` + `sun.sun` in the existing `mapSolar` and nested on `SolarState` (so `/api/state` and `page.tsx` need no change). A pure `resolveSkyVisual()` turns that into a gradient + animation-layer descriptor. A presentational `WeatherBackdrop` paints the animated sky + a scrim behind the data. `SolarCard` applies the gradient (ChillCard pattern) and switches its data chrome to white + frosted-dark glass.

**Tech Stack:** Next.js (App Router) client component, TypeScript (strict), Tailwind v4 + CSS custom properties, Recharts, lucide-react, Vitest + React Testing Library.

## Global Constraints

- **Match the existing widget style** — gradient cards follow `ChillCard`/`ThermostatCard`: `<Card style={{background}} className="relative overflow-hidden text-white">` + an absolute decorative layer + glass sub-controls. Reuse this exactly.
- **Gradient angle** `165deg` (the app's house angle is 155–165°).
- **Legibility is non-negotiable**: white text + a top/bottom **scrim** + **frosted-dark glass** (`rgba(13,22,38,0.22)` + `backdrop-blur` + `border-white/15`) for the chart panel and stat chips. The chart line is white; the Recharts tooltip stays the light `var(--card)` popover.
- **`prefers-reduced-motion: reduce`** must remove all particle motion (the whole `.wx-fx` layer hides); gradient + scrim + header weather icon remain. Follow the existing `@media (prefers-reduced-motion: reduce)` pattern in `globals.css`.
- **Bilingual i18n** — every new key MUST exist in BOTH the EN and NL maps in `lib/i18n.ts` (TS enforces this via `MsgKey`).
- **TDD** — write the failing test first, watch it fail, implement minimally, watch it pass, commit.
- **AGENTS.md** — this repo's Next.js may diverge from training data. Before writing component/CSS code (Tasks 4 & 6), skim the relevant guide under `node_modules/next/dist/docs/` (client components, global CSS) and heed deprecation notices.
- Test commands: per-file `npx vitest run <path>`; full suite `npm test`; lint `npm run lint`; build `npm run build`.

---

### Task 1: Sky data model + normalization (`mapSky`)

**Files:**
- Modify: `lib/types.ts` (add `SkyCondition`, `SkyState`; add `sky` to `SolarState`)
- Modify: `config/devices.ts` (add `WEATHER`)
- Modify: `lib/state-mapper.ts` (add+export `mapSky`, call it from `mapSolar`)
- Modify (test): `lib/state-mapper.test.ts`
- Modify (fixture, to keep compile/suite green): `app/components/SolarCard.test.tsx:13-16`

**Interfaces:**
- Produces: `mapSky(byId: Map<string, HaEntityState>): SkyState`; `SkyState { condition: SkyCondition; isDay: boolean; cloudCoverage: number | null; raw: string | null }`; `SolarState.sky: SkyState`; `WEATHER = { entity: "weather.forecast_home", sun: "sun.sun" }`.

- [ ] **Step 1: Write the failing tests** — append to `lib/state-mapper.test.ts`:

```ts
// add `mapSky` to the existing import from "@/lib/state-mapper"
// import { mapHaStatesToAppState, findClimateRuntime, mapSky } from "@/lib/state-mapper";

describe("mapSky", () => {
  const byId = (s: HaEntityState[]) => new Map(s.map((e) => [e.entity_id, e]));

  it("normalizes HA conditions to sky conditions", () => {
    expect(mapSky(byId([{ entity_id: "weather.forecast_home", state: "partlycloudy", attributes: { cloud_coverage: 40 } }])).condition).toBe("partly-cloudy");
    expect(mapSky(byId([{ entity_id: "weather.forecast_home", state: "pouring", attributes: {} }])).condition).toBe("pouring");
    expect(mapSky(byId([{ entity_id: "weather.forecast_home", state: "snowy-rainy", attributes: {} }])).condition).toBe("sleet");
    expect(mapSky(byId([{ entity_id: "weather.forecast_home", state: "clear-night", attributes: {} }])).condition).toBe("sunny");
  });

  it("reads cloud coverage and falls back to null", () => {
    expect(mapSky(byId([{ entity_id: "weather.forecast_home", state: "cloudy", attributes: { cloud_coverage: 80 } }])).cloudCoverage).toBe(80);
    expect(mapSky(byId([{ entity_id: "weather.forecast_home", state: "cloudy", attributes: {} }])).cloudCoverage).toBeNull();
  });

  it("derives day/night from sun.sun, defaulting to day", () => {
    expect(mapSky(byId([{ entity_id: "sun.sun", state: "below_horizon", attributes: {} }])).isDay).toBe(false);
    expect(mapSky(byId([{ entity_id: "sun.sun", state: "above_horizon", attributes: {} }])).isDay).toBe(true);
    expect(mapSky(byId([])).isDay).toBe(true);
  });

  it("is unknown when the weather entity is missing or unavailable", () => {
    expect(mapSky(byId([])).condition).toBe("unknown");
    expect(mapSky(byId([{ entity_id: "weather.forecast_home", state: "unavailable", attributes: {} }])).condition).toBe("unknown");
  });
});
```

And add a sky assertion inside the existing `describe("mapSolar (via mapHaStatesToAppState)")`:

```ts
  it("attaches the normalized sky (weather + sun) to solar", () => {
    const app = mapHaStatesToAppState([
      { entity_id: "sensor.solaredge_current_power", state: "3240", attributes: {} },
      { entity_id: "weather.forecast_home", state: "rainy", attributes: { cloud_coverage: 90 } },
      { entity_id: "sun.sun", state: "below_horizon", attributes: {} },
    ]);
    expect(app.solar.sky).toMatchObject({ condition: "rain", isDay: false, cloudCoverage: 90 });
  });
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run lib/state-mapper.test.ts`
Expected: FAIL — `mapSky` is not exported / `solar.sky` undefined.

- [ ] **Step 3a: Add the types** — in `lib/types.ts`, directly above `export interface SolarState {`:

```ts
/** Normalized sky condition — day/night is carried separately in SkyState.isDay. */
export type SkyCondition =
  | "sunny" | "partly-cloudy" | "cloudy" | "fog"
  | "rain" | "pouring" | "snow" | "sleet" | "thunder"
  | "unknown";

export interface SkyState {
  condition: SkyCondition;
  isDay: boolean;
  cloudCoverage: number | null; // 0–100
  raw: string | null;           // HA raw condition, for debugging
}
```

Then add this field inside `SolarState` (after `lifetimeKwh`):

```ts
  sky: SkyState;                // weather-driven backdrop state
```

- [ ] **Step 3b: Add the config** — in `config/devices.ts`, near the existing `SOLAR` block:

```ts
export const WEATHER = {
  entity: "weather.forecast_home",
  sun: "sun.sun",
} as const;
```

- [ ] **Step 3c: Implement `mapSky` and wire it into `mapSolar`** — in `lib/state-mapper.ts`:

Add `SkyState`, `SkyCondition` to the existing `@/lib/types` import, and `WEATHER` to the `@/config/devices` import. Then add, above `mapSolar`:

```ts
const HA_CONDITION_TO_SKY: Record<string, SkyCondition> = {
  sunny: "sunny",
  "clear-night": "sunny",
  partlycloudy: "partly-cloudy",
  cloudy: "cloudy",
  windy: "cloudy",
  "windy-variant": "cloudy",
  fog: "fog",
  rainy: "rain",
  pouring: "pouring",
  lightning: "thunder",
  "lightning-rainy": "thunder",
  snowy: "snow",
  hail: "snow",
  "snowy-rainy": "sleet",
};

/** Normalize HA weather + sun entities into the sky state that drives the Solar backdrop. */
export function mapSky(byId: Map<string, HaEntityState>): SkyState {
  const w = byId.get(WEATHER.entity);
  const sun = byId.get(WEATHER.sun);
  const raw = w && w.state !== "unavailable" && w.state !== "unknown" ? w.state : null;
  const condition: SkyCondition = raw ? HA_CONDITION_TO_SKY[raw] ?? "unknown" : "unknown";
  return {
    condition,
    isDay: sun ? sun.state === "above_horizon" : true,
    cloudCoverage: num(w?.attributes.cloud_coverage, null),
    raw,
  };
}
```

Then add `sky` to the object `mapSolar` returns (after `lifetimeKwh`):

```ts
    sky: mapSky(byId),
```

- [ ] **Step 3d: Keep the existing component fixture compiling** — in `app/components/SolarCard.test.tsx`, replace the `solar` fixture (lines 13–16) with:

```ts
const solar: SolarState = {
  available: true, currentPowerW: 3240, netGridKw: -1.8,
  gridDirection: "export", coveragePct: 100, lifetimeKwh: 16186,
  sky: { condition: "sunny", isDay: true, cloudCoverage: 20, raw: "sunny" },
};
```

- [ ] **Step 4: Run to verify it passes** (and nothing else broke)

Run: `npx vitest run lib/state-mapper.test.ts` → Expected: PASS
Run: `npm test` → Expected: PASS (whole suite; confirms no other `SolarState` literal — e.g. `app/api/state/route.test.ts` — broke).
Run: `npm run lint` → Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add lib/types.ts config/devices.ts lib/state-mapper.ts lib/state-mapper.test.ts app/components/SolarCard.test.tsx
git commit -m "feat(solar): normalize HA weather + sun into SolarState.sky"
```

---

### Task 2: Visual resolution (`resolveSkyVisual`)

**Files:**
- Create: `lib/sky-visuals.ts`
- Create (test): `lib/sky-visuals.test.ts`

**Interfaces:**
- Consumes: `SkyCondition` from `@/lib/types`.
- Produces: `resolveSkyVisual(condition: SkyCondition, isDay: boolean, coverage?: number | null): SkyVisual`; `SkyVisual { key: string; gradient: string; layers: SkyLayer[]; icon: SkyIconKey; cloudTone: "white"|"grey"|"dark" }`; `SkyLayer = "sun"|"clouds"|"rain"|"snow"|"stars"|"moon"`; `SkyIconKey = "sun"|"cloud-sun"|"cloud"|"cloud-fog"|"cloud-rain"|"cloud-lightning"|"cloud-snow"|"moon"|"cloud-moon"`.

- [ ] **Step 1: Write the failing test** — `lib/sky-visuals.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { resolveSkyVisual } from "@/lib/sky-visuals";

describe("resolveSkyVisual", () => {
  it("returns a sun scene for sunny + day", () => {
    const v = resolveSkyVisual("sunny", true);
    expect(v.key).toBe("sunny-day");
    expect(v.layers).toEqual(["sun"]);
    expect(v.icon).toBe("sun");
    expect(v.gradient).toContain("linear-gradient");
  });

  it("turns a clear sky into a night scene with moon + stars", () => {
    const v = resolveSkyVisual("sunny", false);
    expect(v.key).toBe("sunny-night");
    expect(v.layers).toEqual(["moon", "stars"]);
    expect(v.icon).toBe("moon");
  });

  it("includes a rain layer for rain, day and night", () => {
    expect(resolveSkyVisual("rain", true).layers).toContain("rain");
    expect(resolveSkyVisual("rain", false).layers).toContain("rain");
  });

  it("falls back to a neutral scene with no layers for unknown", () => {
    const v = resolveSkyVisual("unknown", true);
    expect(v.key).toBe("unknown-day");
    expect(v.layers).toEqual([]);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run lib/sky-visuals.test.ts`
Expected: FAIL — cannot find module `@/lib/sky-visuals`.

- [ ] **Step 3: Implement** — `lib/sky-visuals.ts`:

```ts
import type { SkyCondition } from "@/lib/types";

export type SkyLayer = "sun" | "clouds" | "rain" | "snow" | "stars" | "moon";
export type SkyIconKey =
  | "sun" | "cloud-sun" | "cloud" | "cloud-fog"
  | "cloud-rain" | "cloud-lightning" | "cloud-snow" | "moon" | "cloud-moon";

export interface SkyVisual {
  key: string;
  gradient: string;
  layers: SkyLayer[];
  icon: SkyIconKey;
  cloudTone: "white" | "grey" | "dark";
}

type SkyDef = Omit<SkyVisual, "key">;
const A = "165deg";

const DAY: Record<SkyCondition, SkyDef> = {
  sunny:           { gradient: `linear-gradient(${A}, #2b86c5, #5bb4e6 52%, #f6cf6f)`, layers: ["sun"],                  icon: "sun",             cloudTone: "white" },
  "partly-cloudy": { gradient: `linear-gradient(${A}, #3a8ec7, #76b1d6 55%, #c2cfd9)`, layers: ["sun", "clouds"],        icon: "cloud-sun",       cloudTone: "white" },
  cloudy:          { gradient: `linear-gradient(${A}, #586a7e, #7e8d9e 55%, #a7b2bf)`, layers: ["clouds"],               icon: "cloud",           cloudTone: "grey"  },
  fog:             { gradient: `linear-gradient(${A}, #6b7884, #97a3ad 55%, #c2c9cf)`, layers: ["clouds"],               icon: "cloud-fog",       cloudTone: "grey"  },
  rain:            { gradient: `linear-gradient(${A}, #37475b, #4f6176 55%, #67798e)`, layers: ["clouds", "rain"],        icon: "cloud-rain",      cloudTone: "dark"  },
  pouring:         { gradient: `linear-gradient(${A}, #2c3a4c, #415367 55%, #566b80)`, layers: ["clouds", "rain"],        icon: "cloud-rain",      cloudTone: "dark"  },
  snow:            { gradient: `linear-gradient(${A}, #5f7796, #90a7c1 52%, #c5d4e2)`, layers: ["clouds", "snow"],        icon: "cloud-snow",      cloudTone: "white" },
  sleet:           { gradient: `linear-gradient(${A}, #4a5e74, #71869c 55%, #9fb1c2)`, layers: ["clouds", "rain", "snow"], icon: "cloud-snow",     cloudTone: "grey"  },
  thunder:         { gradient: `linear-gradient(${A}, #2a2f45, #3c4565 55%, #586089)`, layers: ["clouds", "rain"],        icon: "cloud-lightning", cloudTone: "dark"  },
  unknown:         { gradient: `linear-gradient(${A}, #5b6b80, #8492a3 60%, #aab6c4)`, layers: [],                        icon: "cloud",           cloudTone: "grey"  },
};

const NIGHT: Record<SkyCondition, SkyDef> = {
  sunny:           { gradient: `linear-gradient(${A}, #0e1733, #1b2a54 52%, #2b3a64)`, layers: ["moon", "stars"],         icon: "moon",            cloudTone: "dark" },
  "partly-cloudy": { gradient: `linear-gradient(${A}, #141d33, #232f48 55%, #36425e)`, layers: ["clouds", "stars"],       icon: "cloud-moon",      cloudTone: "dark" },
  cloudy:          { gradient: `linear-gradient(${A}, #161d2e, #27303f 55%, #3a4453)`, layers: ["clouds"],                icon: "cloud",           cloudTone: "dark" },
  fog:             { gradient: `linear-gradient(${A}, #1a212e, #2b333f 55%, #3d4753)`, layers: ["clouds"],                icon: "cloud-fog",       cloudTone: "dark" },
  rain:            { gradient: `linear-gradient(${A}, #1e2733, #2c3947 55%, #3a4856)`, layers: ["clouds", "rain"],        icon: "cloud-rain",      cloudTone: "dark" },
  pouring:         { gradient: `linear-gradient(${A}, #18202b, #25313d 55%, #33414f)`, layers: ["clouds", "rain"],        icon: "cloud-rain",      cloudTone: "dark" },
  snow:            { gradient: `linear-gradient(${A}, #27344a, #3a4a63 55%, #56688a)`, layers: ["clouds", "snow"],        icon: "cloud-snow",      cloudTone: "white" },
  sleet:           { gradient: `linear-gradient(${A}, #222e40, #344357 55%, #4a5c78)`, layers: ["clouds", "rain", "snow"], icon: "cloud-snow",     cloudTone: "dark" },
  thunder:         { gradient: `linear-gradient(${A}, #191d2e, #262c44 55%, #3a4060)`, layers: ["clouds", "rain"],        icon: "cloud-lightning", cloudTone: "dark" },
  unknown:         { gradient: `linear-gradient(${A}, #161d2e, #2a3344 60%, #3a4453)`, layers: [],                        icon: "moon",            cloudTone: "dark" },
};

/** Resolve a normalized sky condition into the gradient + animation layers to render.
 *  `coverage` is accepted for future tuning but unused in v1 (condition drives everything). */
export function resolveSkyVisual(condition: SkyCondition, isDay: boolean, coverage: number | null = null): SkyVisual {
  void coverage;
  const table = isDay ? DAY : NIGHT;
  const def = table[condition] ?? table.unknown;
  return { key: `${condition}-${isDay ? "day" : "night"}`, ...def };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run lib/sky-visuals.test.ts` → Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/sky-visuals.ts lib/sky-visuals.test.ts
git commit -m "feat(solar): resolveSkyVisual — gradients + animation layers per condition"
```

---

### Task 3: Weather animation CSS

**Files:**
- Modify: `app/globals.css` (append weather classes + keyframes + reduced-motion guard)

**Interfaces:**
- Produces (CSS classes the component relies on): `.wx-fx`, `.wx-scrim`, `.wx-sun-glow`, `.wx-rays`, `.wx-cloud` (+ `.grey`/`.dark`), `.wx-drop`, `.wx-flake`, `.wx-moon`, `.wx-star`, and keyframes `wx-drift`/`wx-rain`/`wx-snow`/`wx-twinkle`/`wx-sunpulse`/`wx-spin`.

> CSS has no unit test; it is verified structurally by Task 4's render test (classes present) and visually in Task 6. This task is the styling deliverable Task 4 consumes.

- [ ] **Step 1: Read the relevant Next/CSS guidance** (AGENTS.md): skim `node_modules/next/dist/docs/` for global-CSS conventions; confirm `app/globals.css` is the right place (it already holds `.brightness-slider`, `.animate-rise`, keyframes).

- [ ] **Step 2: Append the styles** — add to the end of `app/globals.css`:

```css
/* ===== Weather backdrop (Solar card) ===== */
.wx-fx { position: absolute; inset: 0; overflow: hidden; pointer-events: none; }
.wx-scrim {
  position: absolute; inset: 0; pointer-events: none;
  background: linear-gradient(180deg, rgba(0,0,0,0.10), rgba(0,0,0,0) 34%, rgba(0,0,0,0.26));
}

.wx-sun-glow {
  position: absolute; top: -44px; right: -26px; width: 150px; height: 150px;
  border-radius: 50%; filter: blur(2px);
  background: radial-gradient(circle, rgba(255,240,178,0.95), rgba(255,210,90,0) 70%);
  animation: wx-sunpulse 6s ease-in-out infinite;
}
.wx-rays {
  position: absolute; top: -64px; right: -46px; width: 180px; height: 180px;
  opacity: 0.45; animation: wx-spin 90s linear infinite;
}

.wx-cloud {
  position: absolute; width: 56px; height: 18px; border-radius: 20px;
  background: rgba(255,255,255,0.9); animation: wx-drift linear infinite;
}
.wx-cloud::before { content: ""; position: absolute; width: 26px; height: 26px; background: inherit; border-radius: 50%; top: -11px; left: 9px; }
.wx-cloud::after  { content: ""; position: absolute; width: 20px; height: 20px; background: inherit; border-radius: 50%; top: -8px; left: 31px; }
.wx-cloud.grey { background: rgba(232,237,242,0.92); }
.wx-cloud.dark { background: rgba(150,164,180,0.85); }

.wx-drop {
  position: absolute; top: 0; width: 2px; height: 11px; border-radius: 2px;
  background: rgba(210,228,245,0.8); animation: wx-rain linear infinite;
}
.wx-flake {
  position: absolute; top: 0; width: 6px; height: 6px; border-radius: 50%;
  background: rgba(255,255,255,0.95); box-shadow: 0 0 4px rgba(255,255,255,0.6);
  animation: wx-snow linear infinite;
}

.wx-moon {
  position: absolute; top: 16px; right: 18px; width: 30px; height: 30px; border-radius: 50%;
  background: #eef1f7; box-shadow: 0 0 22px 6px rgba(220,228,245,0.45), inset -7px -3px 0 0 #c4ccdc;
}
.wx-star { position: absolute; width: 2.5px; height: 2.5px; border-radius: 50%; background: #fff; animation: wx-twinkle ease-in-out infinite; }

@keyframes wx-drift { from { transform: translateX(-70px); } to { transform: translateX(360px); } }
@keyframes wx-rain { 0% { transform: translateY(-16px); opacity: 0; } 12% { opacity: 0.85; } 100% { transform: translateY(150px); opacity: 0; } }
@keyframes wx-snow { 0% { transform: translateY(-14px) translateX(0); opacity: 0; } 12% { opacity: 0.95; } 100% { transform: translateY(160px) translateX(14px); opacity: 0.25; } }
@keyframes wx-twinkle { 0%, 100% { opacity: 0.2; } 50% { opacity: 1; } }
@keyframes wx-sunpulse { 0%, 100% { opacity: 0.7; transform: scale(1); } 50% { opacity: 1; transform: scale(1.08); } }
@keyframes wx-spin { to { transform: rotate(360deg); } }

/* Reduced motion: drop the whole animated layer; gradient + scrim + header icon remain. */
@media (prefers-reduced-motion: reduce) {
  .wx-fx { display: none; }
}
```

- [ ] **Step 3: Verify the app still builds** (no test for CSS)

Run: `npm run build` → Expected: success (CSS compiles).

- [ ] **Step 4: Commit**

```bash
git add app/globals.css
git commit -m "feat(solar): weather backdrop animation CSS"
```

---

### Task 4: `WeatherBackdrop` component

**Files:**
- Create: `app/components/WeatherBackdrop.tsx`
- Create (test): `app/components/WeatherBackdrop.test.tsx`

**Interfaces:**
- Consumes: `SkyVisual`, `SkyLayer` from `@/lib/sky-visuals`; CSS classes from Task 3.
- Produces: `WeatherBackdrop({ visual }: { visual: SkyVisual })` — renders a `.wx-fx` particle layer (only the `visual.layers` present) + a sibling `.wx-scrim`.

- [ ] **Step 1: Write the failing test** — `app/components/WeatherBackdrop.test.tsx`:

```tsx
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { WeatherBackdrop } from "@/app/components/WeatherBackdrop";
import { resolveSkyVisual } from "@/lib/sky-visuals";

describe("WeatherBackdrop", () => {
  it("renders sun glow + rays for a sunny day, no rain, plus the scrim", () => {
    const { container } = render(<WeatherBackdrop visual={resolveSkyVisual("sunny", true)} />);
    expect(container.querySelector(".wx-sun-glow")).toBeTruthy();
    expect(container.querySelector(".wx-rays")).toBeTruthy();
    expect(container.querySelector(".wx-drop")).toBeNull();
    expect(container.querySelector(".wx-scrim")).toBeTruthy();
  });

  it("renders moon + stars at night for a clear sky and no sun glow", () => {
    const { container } = render(<WeatherBackdrop visual={resolveSkyVisual("sunny", false)} />);
    expect(container.querySelector(".wx-moon")).toBeTruthy();
    expect(container.querySelectorAll(".wx-star").length).toBeGreaterThan(0);
    expect(container.querySelector(".wx-sun-glow")).toBeNull();
  });

  it("renders drifting clouds + falling drops for rain", () => {
    const { container } = render(<WeatherBackdrop visual={resolveSkyVisual("rain", true)} />);
    expect(container.querySelectorAll(".wx-cloud").length).toBeGreaterThan(0);
    expect(container.querySelectorAll(".wx-drop").length).toBeGreaterThan(0);
  });

  it("renders flakes for snow", () => {
    const { container } = render(<WeatherBackdrop visual={resolveSkyVisual("snow", true)} />);
    expect(container.querySelectorAll(".wx-flake").length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run app/components/WeatherBackdrop.test.tsx`
Expected: FAIL — cannot find module `@/app/components/WeatherBackdrop`.

- [ ] **Step 3: Implement** — `app/components/WeatherBackdrop.tsx`:

```tsx
import type { SkyVisual, SkyLayer } from "@/lib/sky-visuals";

const RAYS = (
  <svg viewBox="0 0 100 100" width="100%" height="100%" aria-hidden>
    <g stroke="rgba(255,255,255,0.55)" strokeWidth="2" strokeLinecap="round">
      <line x1="50" y1="8" x2="50" y2="22" /><line x1="50" y1="78" x2="50" y2="92" />
      <line x1="8" y1="50" x2="22" y2="50" /><line x1="78" y1="50" x2="92" y2="50" />
      <line x1="20" y1="20" x2="30" y2="30" /><line x1="70" y1="70" x2="80" y2="80" />
      <line x1="80" y1="20" x2="70" y2="30" /><line x1="30" y1="70" x2="20" y2="80" />
    </g>
  </svg>
);

const DROPS = [14, 28, 42, 56, 70, 84, 36, 64];
const DROP_DUR = [1.0, 1.2, 0.9, 1.1, 1.0, 1.25, 1.15, 0.95];
const FLAKES = [12, 26, 40, 54, 68, 82, 33, 61];
const FLAKE_DUR = [4.2, 5.0, 4.6, 5.4, 4.4, 5.2, 4.8, 5.6];
const STARS = [
  { top: 30, left: 24, dur: 3.2 }, { top: 52, left: 70, dur: 4.0 },
  { top: 22, left: 120, dur: 3.6 }, { top: 64, left: 160, dur: 4.4 },
  { top: 40, left: 200, dur: 3.0 }, { top: 80, left: 48, dur: 4.2 },
  { top: 90, left: 110, dur: 3.4 },
];

export function WeatherBackdrop({ visual }: { visual: SkyVisual }) {
  const has = (l: SkyLayer) => visual.layers.includes(l);
  const cloudCls = `wx-cloud${visual.cloudTone === "grey" ? " grey" : visual.cloudTone === "dark" ? " dark" : ""}`;
  return (
    <>
      <div className="wx-fx" aria-hidden>
        {has("sun") && (
          <>
            <div className="wx-rays">{RAYS}</div>
            <div className="wx-sun-glow" />
          </>
        )}
        {has("moon") && <div className="wx-moon" />}
        {has("stars") && STARS.map((s, i) => (
          <span key={`st${i}`} className="wx-star" style={{ top: s.top, left: s.left, animationDuration: `${s.dur}s`, animationDelay: `-${i * 0.5}s` }} />
        ))}
        {has("clouds") && (
          <>
            <span className={cloudCls} style={{ top: 26, left: 0, animationDuration: "30s" }} />
            <span className={cloudCls} style={{ top: 58, left: 0, transform: "scale(1.1)", animationDuration: "40s", animationDelay: "-14s" }} />
            <span className={cloudCls} style={{ top: 88, left: 0, transform: "scale(0.78)", opacity: 0.75, animationDuration: "48s", animationDelay: "-26s" }} />
          </>
        )}
        {has("rain") && DROPS.map((left, i) => (
          <span key={`dr${i}`} className="wx-drop" style={{ left: `${left}%`, animationDuration: `${DROP_DUR[i]}s`, animationDelay: `-${(i * 0.13).toFixed(2)}s` }} />
        ))}
        {has("snow") && FLAKES.map((left, i) => (
          <span key={`fl${i}`} className="wx-flake" style={{ left: `${left}%`, animationDuration: `${FLAKE_DUR[i]}s`, animationDelay: `-${(i * 0.4).toFixed(2)}s` }} />
        ))}
      </div>
      <div className="wx-scrim" aria-hidden />
    </>
  );
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run app/components/WeatherBackdrop.test.tsx` → Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add app/components/WeatherBackdrop.tsx app/components/WeatherBackdrop.test.tsx
git commit -m "feat(solar): WeatherBackdrop animated sky + scrim layer"
```

---

### Task 5: Weather i18n labels

**Files:**
- Modify: `lib/i18n.ts` (add `weather.*` to BOTH the EN and NL maps)
- Modify (test): `lib/i18n.test.ts`

**Interfaces:**
- Produces: `MsgKey`s `weather.sunny`, `weather.partlyCloudy`, `weather.cloudy`, `weather.fog`, `weather.rain`, `weather.pouring`, `weather.snow`, `weather.sleet`, `weather.thunder`, `weather.night`, `weather.unknown` — used by `SolarCard`'s `aria-label` (Task 6).

- [ ] **Step 1: Write the failing test** — append to `lib/i18n.test.ts` inside `describe("t (i18n)")`:

```ts
  it("has the weather labels in both languages", () => {
    expect(t("en", "weather.sunny")).toBe("Sunny");
    expect(t("nl", "weather.sunny")).toBe("Zonnig");
    expect(t("nl", "weather.snow")).toBe("Sneeuw");
    expect(t("en", "weather.unknown")).toBe("Weather unavailable");
  });
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run lib/i18n.test.ts`
Expected: FAIL — keys fall back to the raw key string.

- [ ] **Step 3: Implement** — in `lib/i18n.ts`, add to the **EN** map (next to the `solar.*` block):

```ts
  "weather.sunny": "Sunny",
  "weather.partlyCloudy": "Partly cloudy",
  "weather.cloudy": "Cloudy",
  "weather.fog": "Fog",
  "weather.rain": "Rain",
  "weather.pouring": "Heavy rain",
  "weather.snow": "Snow",
  "weather.sleet": "Sleet",
  "weather.thunder": "Thunderstorm",
  "weather.night": "Night",
  "weather.unknown": "Weather unavailable",
```

and the matching keys in the **NL** map:

```ts
  "weather.sunny": "Zonnig",
  "weather.partlyCloudy": "Licht bewolkt",
  "weather.cloudy": "Bewolkt",
  "weather.fog": "Mist",
  "weather.rain": "Regen",
  "weather.pouring": "Hevige regen",
  "weather.snow": "Sneeuw",
  "weather.sleet": "Natte sneeuw",
  "weather.thunder": "Onweer",
  "weather.night": "Nacht",
  "weather.unknown": "Weer onbekend",
```

> `MsgKey` derives from the EN map's keys; TypeScript will error if the NL map is missing any of them — so add to both.

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run lib/i18n.test.ts` → Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/i18n.ts lib/i18n.test.ts
git commit -m "feat(solar): bilingual weather condition labels"
```

---

### Task 6: SolarCard weather redesign

**Files:**
- Modify: `app/components/SolarCard.tsx` (full rewrite of the render + `Stat` glass variant)
- Modify (test): `app/components/SolarCard.test.tsx` (add backdrop assertions)

**Interfaces:**
- Consumes: `solar.sky` (Task 1), `resolveSkyVisual` + `SkyIconKey` (Task 2), `WeatherBackdrop` (Task 4), `weather.*` keys (Task 5).
- Produces: the redesigned card — `<Card data-sky={key} aria-label=…>` with gradient background, `WeatherBackdrop`, white text, glass chart panel + glass stat chips, condition-driven header icon.

- [ ] **Step 1: Read the relevant Next guidance** (AGENTS.md): skim `node_modules/next/dist/docs/` for client-component conventions before editing this `"use client"` file.

- [ ] **Step 2: Write the failing tests** — append to `app/components/SolarCard.test.tsx` inside `describe("SolarCard")`:

```tsx
  it("paints a sunny-day backdrop and keeps the hero readable", () => {
    const { container } = render(<SolarCard solar={solar} />);
    expect(container.querySelector('[data-sky="sunny-day"]')).toBeTruthy();
    expect(container.querySelector(".wx-sun-glow")).toBeTruthy();
    expect(screen.getByText("3,24")).toBeInTheDocument();
  });

  it("switches to a night backdrop with a moon when the sun is down", () => {
    const { container } = render(
      <SolarCard solar={{ ...solar, sky: { condition: "sunny", isDay: false, cloudCoverage: 0, raw: "clear-night" } }} />,
    );
    expect(container.querySelector('[data-sky="sunny-night"]')).toBeTruthy();
    expect(container.querySelector(".wx-moon")).toBeTruthy();
  });

  it("labels the card with the localized weather condition", () => {
    render(<SolarCard solar={{ ...solar, sky: { condition: "rain", isDay: true, cloudCoverage: 80, raw: "rainy" } }} />);
    expect(screen.getByLabelText(/Zonnepanelen — Regen/i)).toBeInTheDocument();
  });
```

- [ ] **Step 3: Run to verify it fails**

Run: `npx vitest run app/components/SolarCard.test.tsx`
Expected: FAIL — no `[data-sky]` / `.wx-sun-glow` / weather aria-label yet.

- [ ] **Step 4: Implement — replace the entire contents of `app/components/SolarCard.tsx` with:**

```tsx
"use client";
import { useEffect, useRef, useState } from "react";
import {
  Sun, CloudSun, Cloud, CloudFog, CloudRain, CloudLightning, CloudSnow, Moon, CloudMoon,
  ChevronDown, Info, type LucideIcon,
} from "lucide-react";
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import type { SolarState, SolarRange, SolarHistoryPoint, SolarHistoryResponse, SolarCostSummary, SkyCondition } from "@/lib/types";
import type { MsgKey } from "@/lib/i18n";
import { Card } from "@/app/components/ui/card";
import { Menu, MenuItem } from "@/app/components/ui/menu";
import { useT } from "@/app/components/LanguageProvider";
import { formatKw, formatKwh, formatPercent, wattsToKw, formatEuro } from "@/lib/metrics";
import { resolveSkyVisual, type SkyIconKey } from "@/lib/sky-visuals";
import { WeatherBackdrop } from "@/app/components/WeatherBackdrop";

const SOLAR_RANGES: SolarRange[] = ["today", "week", "month", "year"];
const RANGE_LABEL_KEY: Record<SolarRange, MsgKey> = {
  today: "solar.range.today",
  week: "solar.range.week",
  month: "solar.range.month",
  year: "solar.range.year",
};

// Chart colours when drawn on the weather gradient (inside the frosted panel).
const CHART_STROKE = "#ffffff";
const CHART_GRID = "rgba(255,255,255,0.18)";
const CHART_TICK = "rgba(255,255,255,0.72)";

const SKY_ICON: Record<SkyIconKey, LucideIcon> = {
  sun: Sun, "cloud-sun": CloudSun, cloud: Cloud, "cloud-fog": CloudFog,
  "cloud-rain": CloudRain, "cloud-lightning": CloudLightning, "cloud-snow": CloudSnow,
  moon: Moon, "cloud-moon": CloudMoon,
};
const SKY_LABEL: Record<SkyCondition, MsgKey> = {
  sunny: "weather.sunny", "partly-cloudy": "weather.partlyCloudy", cloudy: "weather.cloudy",
  fog: "weather.fog", rain: "weather.rain", pouring: "weather.pouring",
  snow: "weather.snow", sleet: "weather.sleet", thunder: "weather.thunder", unknown: "weather.unknown",
};

type HistoryState = {
  chartType: "power" | "energy";
  points: SolarHistoryPoint[];
  producedKwh: number | null;
  cost: SolarCostSummary | null;
};
const EMPTY: HistoryState = { chartType: "power", points: [], producedKwh: null, cost: null };

function RangeMenu({ range, onChange }: { range: SolarRange; onChange: (r: SolarRange) => void }) {
  const t = useT();
  return (
    <Menu
      label={t(RANGE_LABEL_KEY[range])}
      className="shrink-0"
      align="right"
      width="w-32"
      triggerClassName="flex items-center gap-1 rounded-full bg-white/15 px-2.5 py-1 text-xs font-medium text-white transition hover:bg-white/25 active:scale-95"
      trigger={<>{t(RANGE_LABEL_KEY[range])}<ChevronDown size={13} aria-hidden /></>}
    >
      {(close) =>
        SOLAR_RANGES.map((r) => (
          <MenuItem key={r} selected={r === range} onSelect={() => { onChange(r); close(); }}>
            {t(RANGE_LABEL_KEY[r])}
          </MenuItem>
        ))
      }
    </Menu>
  );
}

function Stat({ k, v, color, info, glass }: { k: string; v: string; color?: string; info?: string; glass?: boolean }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const containerCls = glass
    ? "relative min-w-0 flex-1 rounded-2xl border border-white/15 bg-[rgba(13,22,38,0.22)] px-2.5 py-2 backdrop-blur"
    : "relative min-w-0 flex-1 rounded-2xl bg-foreground/[0.035] px-2.5 py-2";
  const labelCls = glass
    ? "truncate text-[0.66rem] uppercase tracking-wide text-white/70"
    : "truncate text-[0.66rem] uppercase tracking-wide text-[var(--muted)]";
  const infoBtnCls = glass
    ? "ml-auto shrink-0 text-white/70 transition hover:text-white active:scale-90"
    : "ml-auto shrink-0 text-[var(--muted)] transition hover:text-foreground active:scale-90";

  return (
    <div ref={ref} className={containerCls}>
      <div className="flex items-center gap-1">
        <span className={labelCls}>{k}</span>
        {info && (
          <button
            type="button"
            aria-label={`Uitleg: ${k}`}
            onClick={() => setOpen((o) => !o)}
            className={infoBtnCls}
          >
            <Info size={11} aria-hidden />
          </button>
        )}
      </div>
      <div
        className={`mt-0.5 truncate text-[0.95rem] font-bold${glass && !color ? " text-white" : ""}`}
        style={color ? { color } : undefined}
      >
        {v}
      </div>
      {info && open && (
        <div
          role="tooltip"
          className="absolute bottom-full left-0 z-10 mb-1 max-w-[12rem] rounded-xl border border-[var(--card-border)] bg-[var(--card)] px-2.5 py-1.5 text-xs font-normal normal-case text-foreground shadow-lg"
        >
          {info}
        </div>
      )}
    </div>
  );
}

export function SolarCard({ solar }: { solar: SolarState }) {
  const t = useT();
  const [range, setRange] = useState<SolarRange>("today");
  const [hist, setHist] = useState<HistoryState>(EMPTY);

  useEffect(() => {
    let alive = true;
    fetch(`/api/solar-history?range=${range}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("bad"))))
      .then((d: SolarHistoryResponse) => {
        if (!alive) return;
        setHist({ chartType: d.chartType, points: d.points ?? [], producedKwh: d.summary?.producedKwh ?? null, cost: d.summary?.cost ?? null });
      })
      .catch(() => { if (alive) setHist(EMPTY); });
    return () => { alive = false; };
  }, [range]);

  const net = solar.netGridKw;
  const netLabel = solar.gridDirection === "export" ? t("solar.toGrid") : t("solar.fromGrid");
  const netColor = solar.gridDirection === "export" ? "var(--accent-cool)" : "var(--accent-warn)";
  const netValue = net == null ? "—" : `${formatKw(Math.abs(net))} kW`;
  const hasChart = hist.points.some((p) => p.value != null);

  const sky = resolveSkyVisual(solar.sky.condition, solar.sky.isDay, solar.sky.cloudCoverage);
  const SkyIcon = SKY_ICON[sky.icon];
  const skyLabel =
    !solar.sky.isDay && solar.sky.condition === "sunny" ? t("weather.night") : t(SKY_LABEL[solar.sky.condition]);

  return (
    <Card
      style={{ background: sky.gradient }}
      className="relative overflow-hidden text-white"
      data-sky={sky.key}
      aria-label={`${t("solar.title")} — ${skyLabel}`}
    >
      <WeatherBackdrop visual={sky} />

      <div className="relative z-10">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2 text-lg font-semibold">
            <SkyIcon size={18} aria-hidden className="shrink-0 text-white" />
            {t("solar.title")}
          </div>
          <RangeMenu range={range} onChange={setRange} />
        </div>

        {!solar.available ? (
          <div className="mt-4 flex h-36 items-center justify-center text-sm text-white/80">
            {t("solar.unavailable")}
          </div>
        ) : (
        <>
        <div className="font-display text-5xl font-medium leading-none tracking-tight [text-shadow:0_2px_8px_rgba(0,0,0,0.25)]">
          {formatKw(wattsToKw(solar.currentPowerW))}
          <span className="ml-1 text-base font-medium text-white/80">kW</span>
        </div>

        <div className="mt-4 rounded-2xl border border-white/15 bg-[rgba(13,22,38,0.22)] p-2 backdrop-blur">
          <div className="h-32">
          {!hasChart ? (
            <div className="flex h-full items-center justify-center text-xs text-white/70">
              {t("solar.empty")}
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              {hist.chartType === "power" ? (
                <AreaChart data={hist.points} margin={{ top: 6, right: 8, bottom: 0, left: 0 }}>
                  <defs>
                    <linearGradient id="solarFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0" stopColor={CHART_STROKE} stopOpacity={0.3} />
                      <stop offset="1" stopColor={CHART_STROKE} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke={CHART_GRID} strokeDasharray="3 3" vertical={false} />
                  <XAxis
                    dataKey="t" type="number" scale="time" domain={["dataMin", "dataMax"]}
                    tickFormatter={(v) => new Date(Number(v)).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    tick={{ fontSize: 10, fill: CHART_TICK }} tickLine={false} axisLine={false} minTickGap={36}
                  />
                  <YAxis
                    width={40} tickCount={4}
                    tickFormatter={(v) => (Number(v) / 1000).toFixed(1).replace(".", ",")}
                    tick={{ fontSize: 10, fill: CHART_TICK }} tickLine={false} axisLine={false}
                  />
                  <Tooltip
                    contentStyle={{ borderRadius: "0.75rem", border: "1px solid var(--card-border)", background: "var(--card)", color: "var(--foreground)", fontSize: "0.75rem", padding: "0.375rem 0.625rem" }}
                    labelFormatter={(v) => new Date(Number(v)).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    formatter={(val) => [`${(Number(val) / 1000).toFixed(2).replace(".", ",")} kW`, t("solar.now")]}
                  />
                  <Area type="monotone" dataKey="value" stroke={CHART_STROKE} strokeWidth={2} fill="url(#solarFill)" isAnimationActive={false} connectNulls />
                </AreaChart>
              ) : (
                <BarChart data={hist.points} margin={{ top: 6, right: 8, bottom: 0, left: 0 }}>
                  <CartesianGrid stroke={CHART_GRID} strokeDasharray="3 3" vertical={false} />
                  <XAxis
                    dataKey="t" type="category" interval="preserveStartEnd"
                    tickFormatter={(v) => new Date(Number(v)).toLocaleDateString([], { day: "numeric", month: "short" })}
                    tick={{ fontSize: 10, fill: CHART_TICK }} tickLine={false} axisLine={false} minTickGap={24}
                  />
                  <YAxis
                    width={40} tickCount={4}
                    tickFormatter={(v) => String(Math.round(Number(v)))}
                    tick={{ fontSize: 10, fill: CHART_TICK }} tickLine={false} axisLine={false}
                  />
                  <Tooltip
                    contentStyle={{ borderRadius: "0.75rem", border: "1px solid var(--card-border)", background: "var(--card)", color: "var(--foreground)", fontSize: "0.75rem", padding: "0.375rem 0.625rem" }}
                    labelFormatter={(v) => new Date(Number(v)).toLocaleDateString([], { day: "numeric", month: "short" })}
                    formatter={(val) => [`${formatKwh(Number(val))} kWh`, t("solar.title")]}
                  />
                  <Bar dataKey="value" fill="rgba(255,255,255,0.85)" radius={[3, 3, 0, 0]} isAnimationActive={false} />
                </BarChart>
              )}
            </ResponsiveContainer>
          )}
          </div>
        </div>

        <div className="mt-4 flex gap-2">
          <Stat glass k={t(RANGE_LABEL_KEY[range])} v={`${formatKwh(hist.producedKwh)} kWh`} />
          <Stat glass k={netLabel} v={netValue} color={netColor} info={t("solar.netInfo")} />
          <Stat glass k={t("solar.coverage")} v={`${formatPercent(solar.coveragePct)}%`} info={t("solar.coverageInfo")} />
        </div>
        {hist.cost && (hist.cost.importCost != null || hist.cost.exportEarnings != null) && (
          <div className="mt-2 flex gap-2">
            <Stat glass k={t("solar.cost")} v={formatEuro(hist.cost.importCost)} />
            <Stat glass k={t("solar.earnings")} v={formatEuro(hist.cost.exportEarnings)} color="var(--accent-cool)" />
          </div>
        )}
        </>
        )}
      </div>
    </Card>
  );
}
```

- [ ] **Step 5: Run to verify it passes** (new + existing SolarCard tests)

Run: `npx vitest run app/components/SolarCard.test.tsx` → Expected: PASS (all, including the pre-existing hero / net-label / info-popover / cost-row / unavailable tests).

- [ ] **Step 6: Full verification**

Run: `npm test` → Expected: PASS
Run: `npm run lint` → Expected: clean
Run: `npm run build` → Expected: success

- [ ] **Step 7: Visual + accessibility check** (use the `run` skill / `npm run dev`)

Open the dashboard, confirm:
- The Solar card shows the live weather gradient (currently `partlycloudy` → blue + drifting clouds + sun).
- Hero kW, chart and stat chips are crisp on the gradient; the chart line is white in its frosted panel.
- Toggle the range menu (Vandaag/Week/Maand/Jaar) — bars render white; cost/earnings row (if present) is glass.
- Temporarily force night/rain/snow to eyeball them: in `lib/state-mapper.ts` `mapSky`, hard-code `condition`/`isDay` (e.g. `return { condition: "snow", isDay: false, … }`), reload, then revert.
- Enable OS "Reduce motion" → particles disappear, gradient + header icon remain, text still legible.

- [ ] **Step 8: Commit**

```bash
git add app/components/SolarCard.tsx app/components/SolarCard.test.tsx
git commit -m "feat(solar): weather-adaptive backdrop on the Solar card"
```

---

## Self-Review

**1. Spec coverage**
- §2 treatment A + subtle animation → Tasks 3, 4, 6. ✓
- §3 data model (types, config, `mapSky`, normalization table) → Task 1. ✓
- §4 `resolveSkyVisual` + palettes (day/night) + layers + icons → Task 2. ✓
- §5 `WeatherBackdrop`, scrim, glass data chrome, header weather icon, white chart, RangeMenu glass, unavailable state → Tasks 4 & 6. ✓
- §6 i18n weather labels → Task 5. ✓
- §7 fallback (`unknown`, missing sun, unavailable) → Task 1 (`mapSky`) + Task 2 (`unknown` def) + Task 6 (unavailable branch). ✓
- §8 reduced-motion + contrast → Task 3 (`@media`) + Task 6 (scrim/glass/text-shadow). ✓
- §10 tests → Tasks 1, 2, 4, 5, 6. ✓
- §11 file list → every file has a task. ✓
- §9 optional polish (cross-fade, lightning, dawn/dusk, coverage-driven clouds) → intentionally OUT, `coverage` param reserved in `resolveSkyVisual`. ✓

**2. Placeholder scan** — no TBD/TODO/"handle edge cases"/"similar to". Every code step shows full code. ✓

**3. Type consistency** — `SkyState`/`SkyCondition` (Task 1) consumed by `resolveSkyVisual` (Task 2) and `SolarCard` (Task 6); `SkyVisual`/`SkyLayer`/`SkyIconKey` (Task 2) consumed by `WeatherBackdrop` (Task 4) and `SolarCard` (Task 6); `weather.*` `MsgKey`s (Task 5) consumed by `SolarCard` `SKY_LABEL`. `resolveSkyVisual(condition, isDay, coverage?)` signature matches its call site. `mapSky(byId)` signature matches its test + `mapSolar` call. ✓
