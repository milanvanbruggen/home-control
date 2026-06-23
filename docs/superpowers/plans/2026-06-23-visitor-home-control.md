# Bezoekers-bediening (Visitor Home Control) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A local-only PWA that lets visitors control woonkamer Hue light scenes, a thermostat, and two Quatt Chill units (Zolder + Speelkamer) through Home Assistant — without installing an app.

**Architecture:** A single Next.js (App Router) app serves both the PWA frontend and a `/api` proxy. The proxy holds the Home Assistant long-lived token server-side and exposes only whitelisted, server-validated actions (the security boundary). The frontend polls `/api/state` every 3s and issues optimistic actions. The app runs as a Docker container next to Home Assistant on the LAN.

**Tech Stack:** Next.js 15 (App Router) · TypeScript (strict) · Tailwind CSS · zod (validation) · Vitest + @testing-library/react + jsdom (tests) · PWA (web manifest + service worker) · Docker.

## Global Constraints

- **Runtime:** Node.js 22+ locally (container image `node:24-alpine`). Next.js (App Router, whatever `create-next-app@latest` installs — 15 or 16). TypeScript `strict: true`.
- **Security boundary:** The HA token lives ONLY server-side (`process.env.HA_TOKEN`), never in client code or `NEXT_PUBLIC_*`. Every write passes server-side validation against the allowlist in `config/devices.ts`.
- **Allowlist is the source of truth:** Only entities/actions declared in `config/devices.ts` are reachable. Climate actions per device: Chill → `on_off | set_mode | set_fan | set_temp`; thermostat → `set_temp`. Scenes → the 8 woonkamer Hue scenes only.
- **Climate values:** `set_mode ∈ {cool, heat}`; `set_temp` must be within the entity's live `min`/`max`; `set_fan` must be one of the entity's live `fanOptions`. Bounds are read from HA entity attributes, never hardcoded.
- **Local-only:** No internet exposure, no auth/login for visitors. App reachable on LAN only.
- **UI copy:** Dutch. Mobile-first. Dark, minimal style matching the Quatt app.
- **Path alias:** `@/*` resolves to repo root (`./*`).
- **Commits:** Conventional Commits, one per task step where indicated.

---

## File Structure

```
home-control/
├── package.json, next.config.mjs, tsconfig.json, tailwind.config.ts,
│   postcss.config.mjs, vitest.config.ts, vitest.setup.ts, .gitignore
├── .env.example                      # HA_URL, HA_TOKEN
├── Dockerfile, docker-compose.yml
├── public/
│   ├── manifest.webmanifest
│   ├── sw.js                         # service worker (app-shell cache)
│   └── icons/icon-192.png, icon-512.png
├── config/
│   └── devices.ts                    # allowlist: chills, thermostat, hue scenes
├── lib/
│   ├── types.ts                      # shared types
│   ├── climate.ts                    # validation + HA-service mapping (security core)
│   ├── ha-client.ts                  # HA REST wrapper: getStates, callService
│   └── state-mapper.ts               # HA states -> AppState + findClimateRuntime
├── app/
│   ├── layout.tsx, globals.css, page.tsx
│   ├── api/state/route.ts
│   ├── api/climate/route.ts
│   ├── api/scene/route.ts
│   ├── hooks/usePolling.ts
│   ├── lib/api.ts                    # client-side fetch helpers (postClimate, postScene)
│   └── components/
│       ├── ChillCard.tsx
│       ├── ThermostatCard.tsx
│       ├── LightScenes.tsx
│       └── ConnectionBanner.tsx
```

Tests are co-located next to source as `*.test.ts(x)`.

---

### Task 1: Project scaffolding & toolchain

**Files:**
- Create: `package.json`, `next.config.mjs`, `tsconfig.json`, `tailwind.config.ts`, `postcss.config.mjs`, `app/layout.tsx`, `app/globals.css`, `app/page.tsx`, `.gitignore`
- Create: `vitest.config.ts`, `vitest.setup.ts`
- Test: `lib/sanity.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: a buildable Next.js app and a working `npm test` (Vitest, jsdom, `@/` alias, jest-dom matchers).

- [ ] **Step 1: Scaffold Next.js app non-interactively**

Run from the repo root (`/Users/milanvanbruggen/Web/home-control`):
```bash
npx --yes create-next-app@latest . \
  --ts --tailwind --app --eslint \
  --no-src-dir --import-alias "@/*" --use-npm --yes
```
If prompts appear about a non-empty directory (the `docs/` folder + git), accept continuing. This generates `package.json`, `next.config.mjs`, `tsconfig.json`, `tailwind.config.ts`, `postcss.config.mjs`, `app/`, `.gitignore`.

- [ ] **Step 2: Add test + validation dependencies**

```bash
npm install zod
npm install -D vitest @vitejs/plugin-react jsdom \
  @testing-library/react @testing-library/dom @testing-library/jest-dom @testing-library/user-event
```

- [ ] **Step 3: Add the Vitest config**

Create `vitest.config.ts`:
```ts
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./vitest.setup.ts"],
  },
  resolve: {
    alias: { "@": fileURLToPath(new URL("./", import.meta.url)) },
  },
});
```

Create `vitest.setup.ts`:
```ts
import "@testing-library/jest-dom/vitest";
```

- [ ] **Step 4: Add the `test` script**

In `package.json`, add to `"scripts"`:
```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 5: Write a sanity test**

Create `lib/sanity.test.ts`:
```ts
import { describe, it, expect } from "vitest";

describe("toolchain", () => {
  it("runs vitest", () => {
    expect(1 + 1).toBe(2);
  });
});
```

- [ ] **Step 6: Run the test and the build**

Run:
```bash
npm test
npm run build
```
Expected: test PASS; `next build` completes without errors.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "chore: scaffold Next.js app with Vitest toolchain"
```

---

### Task 2: Shared types & device allowlist

**Files:**
- Create: `lib/types.ts`
- Create: `config/devices.ts`
- Test: `config/devices.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - Types: `HvacMode`, `ChillState`, `ThermostatState`, `SceneRef`, `AppState`, `HaEntityState`, `ClimateActionKind`, `ClimateDeviceConfig`.
  - Config: `CHILLS`, `THERMOSTAT`, `HUE_SCENES`, `CLIMATE_DEVICES`, `findClimateDevice(id): ClimateDeviceConfig | undefined`, `isAllowedScene(id): boolean`, `sceneList(): SceneRef[]`.

- [ ] **Step 1: Write the failing test**

Create `config/devices.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import {
  CHILLS, THERMOSTAT, HUE_SCENES,
  findClimateDevice, isAllowedScene, sceneList,
} from "@/config/devices";

describe("device allowlist", () => {
  it("has two chills and a thermostat", () => {
    expect(CHILLS).toHaveLength(2);
    expect(THERMOSTAT.kind).toBe("thermostat");
  });

  it("has exactly the 8 woonkamer hue scenes with unique ids", () => {
    expect(HUE_SCENES).toHaveLength(8);
    const ids = HUE_SCENES.map((s) => s.id);
    expect(new Set(ids).size).toBe(8);
    expect(HUE_SCENES.map((s) => s.name)).toEqual([
      "Pumpkin Spice", "Ontspannen", "Aan Tafel!", "Gedimd",
      "Lezen", "Lentebloesem", "Helder", "Uit",
    ]);
  });

  it("finds whitelisted climate devices and rejects others", () => {
    expect(findClimateDevice("climate.zolder_chill")?.kind).toBe("chill");
    expect(findClimateDevice("climate.thermostaat")?.kind).toBe("thermostat");
    expect(findClimateDevice("climate.evil")).toBeUndefined();
  });

  it("allows only the configured scenes", () => {
    expect(isAllowedScene("scene.woonkamer_ontspannen")).toBe(true);
    expect(isAllowedScene("scene.bedroom_secret")).toBe(false);
  });

  it("chill allows all four actions; thermostat only set_temp", () => {
    expect(findClimateDevice("climate.zolder_chill")?.actions).toEqual(
      ["on_off", "set_mode", "set_fan", "set_temp"],
    );
    expect(THERMOSTAT.actions).toEqual(["set_temp"]);
  });

  it("sceneList returns SceneRef objects", () => {
    expect(sceneList()[0]).toEqual({ id: HUE_SCENES[0].id, name: "Pumpkin Spice" });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run config/devices.test.ts`
Expected: FAIL — cannot resolve `@/config/devices`.

- [ ] **Step 3: Write the types**

Create `lib/types.ts`:
```ts
export type HvacMode = "cool" | "heat" | "off";

export interface ChillState {
  id: string;
  name: string;
  available: boolean;
  on: boolean;
  mode: HvacMode;
  temp: number | null;
  current: number | null;
  fan: string | null;
  min: number;
  max: number;
  step: number;
  fanOptions: string[];
}

export interface ThermostatState {
  id: string;
  name: string;
  available: boolean;
  temp: number | null;
  current: number | null;
  min: number;
  max: number;
  step: number;
}

export interface SceneRef {
  id: string;
  name: string;
}

export interface AppState {
  chills: ChillState[];
  thermostat: ThermostatState | null;
  scenes: SceneRef[];
}

export interface HaEntityState {
  entity_id: string;
  state: string;
  attributes: Record<string, unknown>;
}

export type ClimateActionKind = "on_off" | "set_mode" | "set_fan" | "set_temp";

export interface ClimateDeviceConfig {
  id: string;
  name: string;
  kind: "chill" | "thermostat";
  actions: readonly ClimateActionKind[];
}
```

- [ ] **Step 4: Write the config (allowlist)**

Create `config/devices.ts`. The `entity_id`s are placeholders — replace with the real ids discovered from HA during Task 16's acceptance check.
```ts
import type { ClimateDeviceConfig, SceneRef } from "@/lib/types";

export const CHILLS: readonly ClimateDeviceConfig[] = [
  { id: "climate.zolder_chill", name: "Zolder", kind: "chill",
    actions: ["on_off", "set_mode", "set_fan", "set_temp"] },
  { id: "climate.speelkamer_chill", name: "Speelkamer", kind: "chill",
    actions: ["on_off", "set_mode", "set_fan", "set_temp"] },
];

export const THERMOSTAT: ClimateDeviceConfig = {
  id: "climate.thermostaat", name: "Thermostaat", kind: "thermostat",
  actions: ["set_temp"],
};

export const HUE_SCENES: readonly SceneRef[] = [
  { id: "scene.woonkamer_pumpkin_spice", name: "Pumpkin Spice" },
  { id: "scene.woonkamer_ontspannen", name: "Ontspannen" },
  { id: "scene.woonkamer_aan_tafel", name: "Aan Tafel!" },
  { id: "scene.woonkamer_gedimd", name: "Gedimd" },
  { id: "scene.woonkamer_lezen", name: "Lezen" },
  { id: "scene.woonkamer_lentebloesem", name: "Lentebloesem" },
  { id: "scene.woonkamer_helder", name: "Helder" },
  { id: "scene.woonkamer_uit", name: "Uit" },
];

export const CLIMATE_DEVICES: readonly ClimateDeviceConfig[] = [...CHILLS, THERMOSTAT];

export function findClimateDevice(id: string): ClimateDeviceConfig | undefined {
  return CLIMATE_DEVICES.find((d) => d.id === id);
}

export function isAllowedScene(id: string): boolean {
  return HUE_SCENES.some((s) => s.id === id);
}

export function sceneList(): SceneRef[] {
  return HUE_SCENES.map((s) => ({ id: s.id, name: s.name }));
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run config/devices.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 6: Commit**

```bash
git add lib/types.ts config/devices.ts config/devices.test.ts
git commit -m "feat: shared types and device allowlist"
```

---

### Task 3: Climate validation & HA-service mapping (security core)

**Files:**
- Create: `lib/climate.ts`
- Test: `lib/climate.test.ts`

**Interfaces:**
- Consumes: `ChillState`, `ThermostatState`, `ClimateActionKind` from `@/lib/types`.
- Produces:
  - `type ClimateRuntime = ChillState | ThermostatState`
  - `validateClimateValue(action: ClimateActionKind, value: unknown, runtime: ClimateRuntime): { ok: true; value: boolean | string | number } | { ok: false; error: string }`
  - `climateActionToService(id: string, action: ClimateActionKind, value: boolean | string | number, runtime: ClimateRuntime): { domain: "climate"; service: string; data: Record<string, unknown> }`

- [ ] **Step 1: Write the failing test**

Create `lib/climate.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { validateClimateValue, climateActionToService } from "@/lib/climate";
import type { ChillState } from "@/lib/types";

const chill: ChillState = {
  id: "climate.zolder_chill", name: "Zolder", available: true, on: true,
  mode: "cool", temp: 18, current: 24.4, fan: "Hoog",
  min: 16, max: 30, step: 1, fanOptions: ["Laag", "Normaal", "Hoog"],
};

describe("validateClimateValue", () => {
  it("accepts a temp within bounds", () => {
    expect(validateClimateValue("set_temp", 20, chill)).toEqual({ ok: true, value: 20 });
  });
  it("rejects a temp above max", () => {
    expect(validateClimateValue("set_temp", 99, chill)).toEqual({ ok: false, error: "temp_out_of_range" });
  });
  it("rejects a non-numeric temp", () => {
    expect(validateClimateValue("set_temp", "warm", chill)).toEqual({ ok: false, error: "temp_out_of_range" });
  });
  it("accepts a valid mode and rejects others", () => {
    expect(validateClimateValue("set_mode", "heat", chill)).toEqual({ ok: true, value: "heat" });
    expect(validateClimateValue("set_mode", "auto", chill)).toEqual({ ok: false, error: "bad_mode" });
  });
  it("accepts a fan in fanOptions and rejects others", () => {
    expect(validateClimateValue("set_fan", "Laag", chill)).toEqual({ ok: true, value: "Laag" });
    expect(validateClimateValue("set_fan", "Turbo", chill)).toEqual({ ok: false, error: "bad_fan" });
  });
  it("accepts a boolean on_off and rejects non-boolean", () => {
    expect(validateClimateValue("on_off", false, chill)).toEqual({ ok: true, value: false });
    expect(validateClimateValue("on_off", "yes", chill)).toEqual({ ok: false, error: "bad_on_off" });
  });
});

describe("climateActionToService", () => {
  it("maps set_temp to set_temperature", () => {
    expect(climateActionToService(chill.id, "set_temp", 20, chill)).toEqual({
      domain: "climate", service: "set_temperature",
      data: { entity_id: chill.id, temperature: 20 },
    });
  });
  it("maps set_mode to set_hvac_mode", () => {
    expect(climateActionToService(chill.id, "set_mode", "heat", chill)).toEqual({
      domain: "climate", service: "set_hvac_mode",
      data: { entity_id: chill.id, hvac_mode: "heat" },
    });
  });
  it("maps set_fan to set_fan_mode", () => {
    expect(climateActionToService(chill.id, "set_fan", "Laag", chill)).toEqual({
      domain: "climate", service: "set_fan_mode",
      data: { entity_id: chill.id, fan_mode: "Laag" },
    });
  });
  it("maps on_off=false to set_hvac_mode off", () => {
    expect(climateActionToService(chill.id, "on_off", false, chill)).toEqual({
      domain: "climate", service: "set_hvac_mode",
      data: { entity_id: chill.id, hvac_mode: "off" },
    });
  });
  it("maps on_off=true to the current mode", () => {
    expect(climateActionToService(chill.id, "on_off", true, chill).data).toEqual({
      entity_id: chill.id, hvac_mode: "cool",
    });
  });
  it("maps on_off=true to cool when currently off", () => {
    const offChill = { ...chill, mode: "off" as const, on: false };
    expect(climateActionToService(chill.id, "on_off", true, offChill).data).toEqual({
      entity_id: chill.id, hvac_mode: "cool",
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/climate.test.ts`
Expected: FAIL — `@/lib/climate` not found.

- [ ] **Step 3: Write the implementation**

Create `lib/climate.ts`:
```ts
import type { ChillState, ThermostatState, ClimateActionKind } from "@/lib/types";

export type ClimateRuntime = ChillState | ThermostatState;

type ValidationResult =
  | { ok: true; value: boolean | string | number }
  | { ok: false; error: string };

function isChill(r: ClimateRuntime): r is ChillState {
  return "fanOptions" in r;
}

export function validateClimateValue(
  action: ClimateActionKind,
  value: unknown,
  runtime: ClimateRuntime,
): ValidationResult {
  switch (action) {
    case "set_temp": {
      if (typeof value !== "number" || Number.isNaN(value)) {
        return { ok: false, error: "temp_out_of_range" };
      }
      if (value < runtime.min || value > runtime.max) {
        return { ok: false, error: "temp_out_of_range" };
      }
      return { ok: true, value };
    }
    case "set_mode": {
      if (value === "cool" || value === "heat") return { ok: true, value };
      return { ok: false, error: "bad_mode" };
    }
    case "set_fan": {
      if (isChill(runtime) && typeof value === "string" && runtime.fanOptions.includes(value)) {
        return { ok: true, value };
      }
      return { ok: false, error: "bad_fan" };
    }
    case "on_off": {
      if (typeof value === "boolean") return { ok: true, value };
      return { ok: false, error: "bad_on_off" };
    }
    default:
      return { ok: false, error: "bad_action" };
  }
}

export function climateActionToService(
  id: string,
  action: ClimateActionKind,
  value: boolean | string | number,
  runtime: ClimateRuntime,
): { domain: "climate"; service: string; data: Record<string, unknown> } {
  switch (action) {
    case "set_temp":
      return { domain: "climate", service: "set_temperature", data: { entity_id: id, temperature: value } };
    case "set_mode":
      return { domain: "climate", service: "set_hvac_mode", data: { entity_id: id, hvac_mode: value } };
    case "set_fan":
      return { domain: "climate", service: "set_fan_mode", data: { entity_id: id, fan_mode: value } };
    case "on_off": {
      const currentMode = isChill(runtime) ? runtime.mode : "off";
      const onMode = currentMode && currentMode !== "off" ? currentMode : "cool";
      const hvac_mode = value ? onMode : "off";
      return { domain: "climate", service: "set_hvac_mode", data: { entity_id: id, hvac_mode } };
    }
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/climate.test.ts`
Expected: PASS (all cases).

- [ ] **Step 5: Commit**

```bash
git add lib/climate.ts lib/climate.test.ts
git commit -m "feat: climate validation and HA-service mapping"
```

---

### Task 4: Home Assistant REST client

**Files:**
- Create: `lib/ha-client.ts`
- Test: `lib/ha-client.test.ts`

**Interfaces:**
- Consumes: `HaEntityState` from `@/lib/types`.
- Produces:
  - `class HaError extends Error { status: number }`
  - `getStates(): Promise<HaEntityState[]>`
  - `callService(domain: string, service: string, data: Record<string, unknown>): Promise<void>`

- [ ] **Step 1: Write the failing test**

Create `lib/ha-client.test.ts`:
```ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

describe("ha-client", () => {
  beforeEach(() => {
    vi.stubEnv("HA_URL", "http://ha.local:8123");
    vi.stubEnv("HA_TOKEN", "tok123");
    vi.stubGlobal("fetch", vi.fn());
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it("getStates calls HA /api/states with bearer token", async () => {
    (fetch as any).mockResolvedValue({ ok: true, json: async () => [{ entity_id: "x", state: "on", attributes: {} }] });
    const { getStates } = await import("@/lib/ha-client");
    const states = await getStates();
    expect(states).toHaveLength(1);
    expect(fetch).toHaveBeenCalledWith(
      "http://ha.local:8123/api/states",
      expect.objectContaining({ headers: { Authorization: "Bearer tok123" }, cache: "no-store" }),
    );
  });

  it("getStates throws HaError with status on non-ok", async () => {
    (fetch as any).mockResolvedValue({ ok: false, status: 401 });
    const { getStates, HaError } = await import("@/lib/ha-client");
    await expect(getStates()).rejects.toMatchObject({ status: 401 });
    await expect(getStates()).rejects.toBeInstanceOf(HaError);
  });

  it("callService POSTs to the service endpoint with JSON body", async () => {
    (fetch as any).mockResolvedValue({ ok: true, json: async () => [] });
    const { callService } = await import("@/lib/ha-client");
    await callService("climate", "set_temperature", { entity_id: "climate.zolder_chill", temperature: 20 });
    expect(fetch).toHaveBeenCalledWith(
      "http://ha.local:8123/api/services/climate/set_temperature",
      expect.objectContaining({
        method: "POST",
        headers: { Authorization: "Bearer tok123", "Content-Type": "application/json" },
        body: JSON.stringify({ entity_id: "climate.zolder_chill", temperature: 20 }),
        cache: "no-store",
      }),
    );
  });

  it("callService throws HaError on non-ok", async () => {
    (fetch as any).mockResolvedValue({ ok: false, status: 502 });
    const { callService } = await import("@/lib/ha-client");
    await expect(callService("scene", "turn_on", { entity_id: "scene.woonkamer_uit" }))
      .rejects.toMatchObject({ status: 502 });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/ha-client.test.ts`
Expected: FAIL — `@/lib/ha-client` not found.

- [ ] **Step 3: Write the implementation**

Create `lib/ha-client.ts`:
```ts
import type { HaEntityState } from "@/lib/types";

export class HaError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "HaError";
    this.status = status;
  }
}

function baseUrl(): string {
  const url = process.env.HA_URL;
  if (!url) throw new HaError("HA_URL not configured", 503);
  return url.replace(/\/$/, "");
}

function authHeader(): string {
  const token = process.env.HA_TOKEN;
  if (!token) throw new HaError("HA_TOKEN not configured", 503);
  return `Bearer ${token}`;
}

export async function getStates(): Promise<HaEntityState[]> {
  const res = await fetch(`${baseUrl()}/api/states`, {
    headers: { Authorization: authHeader() },
    cache: "no-store",
  });
  if (!res.ok) throw new HaError(`HA /api/states failed: ${res.status}`, res.status);
  return (await res.json()) as HaEntityState[];
}

export async function callService(
  domain: string,
  service: string,
  data: Record<string, unknown>,
): Promise<void> {
  const res = await fetch(`${baseUrl()}/api/services/${domain}/${service}`, {
    method: "POST",
    headers: { Authorization: authHeader(), "Content-Type": "application/json" },
    body: JSON.stringify(data),
    cache: "no-store",
  });
  if (!res.ok) throw new HaError(`HA ${domain}.${service} failed: ${res.status}`, res.status);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/ha-client.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/ha-client.ts lib/ha-client.test.ts
git commit -m "feat: Home Assistant REST client"
```

---

### Task 5: State mapper (HA states → AppState)

**Files:**
- Create: `lib/state-mapper.ts`
- Test: `lib/state-mapper.test.ts`

**Interfaces:**
- Consumes: `HaEntityState`, `AppState`, `ChillState`, `ThermostatState`, `HvacMode` from `@/lib/types`; `CHILLS`, `THERMOSTAT`, `sceneList` from `@/config/devices`; `ClimateRuntime` from `@/lib/climate`.
- Produces:
  - `mapHaStatesToAppState(states: HaEntityState[]): AppState`
  - `findClimateRuntime(app: AppState, id: string): ClimateRuntime | undefined`

- [ ] **Step 1: Write the failing test**

Create `lib/state-mapper.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { mapHaStatesToAppState, findClimateRuntime } from "@/lib/state-mapper";
import type { HaEntityState } from "@/lib/types";

const states: HaEntityState[] = [
  {
    entity_id: "climate.zolder_chill", state: "cool",
    attributes: {
      current_temperature: 24.4, temperature: 18, fan_mode: "Hoog",
      fan_modes: ["Laag", "Normaal", "Hoog"], min_temp: 16, max_temp: 30, target_temp_step: 1,
    },
  },
  {
    entity_id: "climate.speelkamer_chill", state: "off",
    attributes: {
      current_temperature: 21, temperature: 20, fan_mode: "Laag",
      fan_modes: ["Laag", "Normaal", "Hoog"], min_temp: 16, max_temp: 30, target_temp_step: 1,
    },
  },
  {
    entity_id: "climate.thermostaat", state: "heat",
    attributes: { current_temperature: 19.6, temperature: 20, min_temp: 5, max_temp: 30, target_temp_step: 0.5 },
  },
  { entity_id: "light.irrelevant", state: "on", attributes: {} },
];

describe("mapHaStatesToAppState", () => {
  it("maps the two chills with bounds and on/off from state", () => {
    const app = mapHaStatesToAppState(states);
    expect(app.chills).toHaveLength(2);
    const zolder = app.chills[0];
    expect(zolder).toMatchObject({
      id: "climate.zolder_chill", name: "Zolder", available: true, on: true,
      mode: "cool", temp: 18, current: 24.4, fan: "Hoog",
      min: 16, max: 30, step: 1, fanOptions: ["Laag", "Normaal", "Hoog"],
    });
    expect(app.chills[1]).toMatchObject({ on: false, mode: "off" });
  });

  it("maps the thermostat", () => {
    const app = mapHaStatesToAppState(states);
    expect(app.thermostat).toMatchObject({
      id: "climate.thermostaat", name: "Thermostaat", available: true,
      temp: 20, current: 19.6, min: 5, max: 30, step: 0.5,
    });
  });

  it("includes the configured scene list", () => {
    const app = mapHaStatesToAppState(states);
    expect(app.scenes).toHaveLength(8);
    expect(app.scenes[0].name).toBe("Pumpkin Spice");
  });

  it("marks a missing entity unavailable with safe defaults", () => {
    const app = mapHaStatesToAppState([]);
    expect(app.chills[0]).toMatchObject({ available: false, on: false, mode: "off", temp: null });
    expect(app.thermostat?.available).toBe(false);
  });

  it("treats HA 'unavailable' state as not available", () => {
    const app = mapHaStatesToAppState([
      { entity_id: "climate.zolder_chill", state: "unavailable", attributes: {} },
    ]);
    expect(app.chills[0].available).toBe(false);
  });
});

describe("findClimateRuntime", () => {
  it("finds a chill and the thermostat by id", () => {
    const app = mapHaStatesToAppState(states);
    expect(findClimateRuntime(app, "climate.speelkamer_chill")?.id).toBe("climate.speelkamer_chill");
    expect(findClimateRuntime(app, "climate.thermostaat")?.id).toBe("climate.thermostaat");
    expect(findClimateRuntime(app, "climate.nope")).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/state-mapper.test.ts`
Expected: FAIL — `@/lib/state-mapper` not found.

- [ ] **Step 3: Write the implementation**

Create `lib/state-mapper.ts`:
```ts
import type { AppState, ChillState, ThermostatState, HaEntityState, HvacMode } from "@/lib/types";
import { CHILLS, THERMOSTAT, sceneList } from "@/config/devices";
import type { ClimateRuntime } from "@/lib/climate";

function num(v: unknown, fallback: number | null): number | null {
  return typeof v === "number" && !Number.isNaN(v) ? v : fallback;
}

function str(v: unknown, fallback: string | null): string | null {
  return typeof v === "string" ? v : fallback;
}

function strArray(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
}

function toMode(state: string): HvacMode {
  return state === "cool" || state === "heat" ? state : "off";
}

function mapChill(name: string, id: string, e: HaEntityState | undefined): ChillState {
  if (!e || e.state === "unavailable") {
    return {
      id, name, available: false, on: false, mode: "off", temp: null, current: null,
      fan: null, min: 16, max: 30, step: 1, fanOptions: [],
    };
  }
  const a = e.attributes;
  return {
    id, name, available: true,
    on: e.state !== "off",
    mode: toMode(e.state),
    temp: num(a.temperature, null),
    current: num(a.current_temperature, null),
    fan: str(a.fan_mode, null),
    min: num(a.min_temp, 16) as number,
    max: num(a.max_temp, 30) as number,
    step: num(a.target_temp_step, 1) as number,
    fanOptions: strArray(a.fan_modes),
  };
}

function mapThermostat(e: HaEntityState | undefined): ThermostatState {
  const { id, name } = THERMOSTAT;
  if (!e || e.state === "unavailable") {
    return { id, name, available: false, temp: null, current: null, min: 5, max: 30, step: 0.5 };
  }
  const a = e.attributes;
  return {
    id, name, available: true,
    temp: num(a.temperature, null),
    current: num(a.current_temperature, null),
    min: num(a.min_temp, 5) as number,
    max: num(a.max_temp, 30) as number,
    step: num(a.target_temp_step, 0.5) as number,
  };
}

export function mapHaStatesToAppState(states: HaEntityState[]): AppState {
  const byId = new Map(states.map((s) => [s.entity_id, s]));
  return {
    chills: CHILLS.map((c) => mapChill(c.name, c.id, byId.get(c.id))),
    thermostat: mapThermostat(byId.get(THERMOSTAT.id)),
    scenes: sceneList(),
  };
}

export function findClimateRuntime(app: AppState, id: string): ClimateRuntime | undefined {
  if (app.thermostat && app.thermostat.id === id) return app.thermostat;
  return app.chills.find((c) => c.id === id);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/state-mapper.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/state-mapper.ts lib/state-mapper.test.ts
git commit -m "feat: map HA states to app state"
```

---

### Task 6: `GET /api/state` route

**Files:**
- Create: `app/api/state/route.ts`
- Test: `app/api/state/route.test.ts`

**Interfaces:**
- Consumes: `getStates`, `HaError` from `@/lib/ha-client`; `mapHaStatesToAppState` from `@/lib/state-mapper`.
- Produces: `GET(): Promise<Response>` returning `AppState` JSON (200), or `{ error }` with 502 (HA error) / 500 (other).

- [ ] **Step 1: Write the failing test**

Create `app/api/state/route.test.ts`:
```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/ha-client", () => ({
  getStates: vi.fn(),
  HaError: class HaError extends Error { status: number; constructor(m: string, s: number){ super(m); this.status = s; } },
}));

import { getStates, HaError } from "@/lib/ha-client";
import { GET } from "@/app/api/state/route";

describe("GET /api/state", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns mapped AppState on success", async () => {
    (getStates as any).mockResolvedValue([
      { entity_id: "climate.zolder_chill", state: "cool",
        attributes: { current_temperature: 24, temperature: 18, fan_mode: "Hoog",
          fan_modes: ["Laag","Normaal","Hoog"], min_temp: 16, max_temp: 30, target_temp_step: 1 } },
    ]);
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.chills[0].id).toBe("climate.zolder_chill");
    expect(body.scenes).toHaveLength(8);
  });

  it("returns 502 when HA errors", async () => {
    (getStates as any).mockRejectedValue(new HaError("down", 502));
    const res = await GET();
    expect(res.status).toBe(502);
    expect((await res.json()).error).toBe("state_unavailable");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run app/api/state/route.test.ts`
Expected: FAIL — route not found.

- [ ] **Step 3: Write the implementation**

Create `app/api/state/route.ts`:
```ts
import { getStates, HaError } from "@/lib/ha-client";
import { mapHaStatesToAppState } from "@/lib/state-mapper";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  try {
    const states = await getStates();
    return Response.json(mapHaStatesToAppState(states));
  } catch (e) {
    const status = e instanceof HaError ? e.status : 500;
    return Response.json({ error: "state_unavailable" }, { status: status >= 500 ? status : 502 });
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run app/api/state/route.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/api/state/route.ts app/api/state/route.test.ts
git commit -m "feat: GET /api/state route"
```

---

### Task 7: `POST /api/climate` route

**Files:**
- Create: `app/api/climate/route.ts`
- Test: `app/api/climate/route.test.ts`

**Interfaces:**
- Consumes: `getStates`, `callService`, `HaError` from `@/lib/ha-client`; `mapHaStatesToAppState`, `findClimateRuntime` from `@/lib/state-mapper`; `findClimateDevice` from `@/config/devices`; `validateClimateValue`, `climateActionToService` from `@/lib/climate`.
- Produces: `POST(req: Request): Promise<Response>` → `{ ok: true }` (200); `{ error }` 400 (bad body / not allowed / validation) or 502 (HA error).

- [ ] **Step 1: Write the failing test**

Create `app/api/climate/route.test.ts`:
```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/ha-client", () => ({
  getStates: vi.fn(),
  callService: vi.fn(),
  HaError: class HaError extends Error { status: number; constructor(m: string, s: number){ super(m); this.status = s; } },
}));

import { getStates, callService } from "@/lib/ha-client";
import { POST } from "@/app/api/climate/route";

const zolderState = {
  entity_id: "climate.zolder_chill", state: "cool",
  attributes: { current_temperature: 24, temperature: 18, fan_mode: "Hoog",
    fan_modes: ["Laag", "Normaal", "Hoog"], min_temp: 16, max_temp: 30, target_temp_step: 1 },
};

function post(body: unknown): Request {
  return new Request("http://localhost/api/climate", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
}

describe("POST /api/climate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (getStates as any).mockResolvedValue([zolderState]);
    (callService as any).mockResolvedValue(undefined);
  });

  it("sets a valid temperature", async () => {
    const res = await POST(post({ id: "climate.zolder_chill", action: "set_temp", value: 20 }));
    expect(res.status).toBe(200);
    expect(callService).toHaveBeenCalledWith("climate", "set_temperature",
      { entity_id: "climate.zolder_chill", temperature: 20 });
  });

  it("rejects an entity not on the allowlist with 400", async () => {
    const res = await POST(post({ id: "climate.evil", action: "set_temp", value: 20 }));
    expect(res.status).toBe(400);
    expect(callService).not.toHaveBeenCalled();
  });

  it("rejects an action the device does not allow (thermostat fan) with 400", async () => {
    (getStates as any).mockResolvedValue([{ entity_id: "climate.thermostaat", state: "heat",
      attributes: { current_temperature: 19, temperature: 20, min_temp: 5, max_temp: 30, target_temp_step: 0.5 } }]);
    const res = await POST(post({ id: "climate.thermostaat", action: "set_fan", value: "Hoog" }));
    expect(res.status).toBe(400);
    expect(callService).not.toHaveBeenCalled();
  });

  it("rejects an out-of-range temp with 400", async () => {
    const res = await POST(post({ id: "climate.zolder_chill", action: "set_temp", value: 99 }));
    expect(res.status).toBe(400);
    expect(callService).not.toHaveBeenCalled();
  });

  it("rejects a malformed body with 400", async () => {
    const res = await POST(post({ id: "climate.zolder_chill" }));
    expect(res.status).toBe(400);
  });

  it("returns 502 when the HA service call fails", async () => {
    const { HaError } = await import("@/lib/ha-client");
    (callService as any).mockRejectedValue(new HaError("fail", 502));
    const res = await POST(post({ id: "climate.zolder_chill", action: "set_mode", value: "heat" }));
    expect(res.status).toBe(502);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run app/api/climate/route.test.ts`
Expected: FAIL — route not found.

- [ ] **Step 3: Write the implementation**

Create `app/api/climate/route.ts`:
```ts
import { z } from "zod";
import { getStates, callService } from "@/lib/ha-client";
import { mapHaStatesToAppState, findClimateRuntime } from "@/lib/state-mapper";
import { findClimateDevice } from "@/config/devices";
import { validateClimateValue, climateActionToService } from "@/lib/climate";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  id: z.string(),
  action: z.enum(["on_off", "set_mode", "set_fan", "set_temp"]),
  value: z.union([z.boolean(), z.string(), z.number()]),
});

export async function POST(req: Request): Promise<Response> {
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "bad_request" }, { status: 400 });

  const { id, action, value } = parsed.data;
  const device = findClimateDevice(id);
  if (!device) return Response.json({ error: "not_allowed" }, { status: 400 });
  if (!device.actions.includes(action)) return Response.json({ error: "action_not_allowed" }, { status: 400 });

  let runtime;
  try {
    runtime = findClimateRuntime(mapHaStatesToAppState(await getStates()), id);
  } catch {
    return Response.json({ error: "ha_unavailable" }, { status: 502 });
  }
  if (!runtime || !runtime.available) return Response.json({ error: "unavailable" }, { status: 502 });

  const validation = validateClimateValue(action, value, runtime);
  if (!validation.ok) return Response.json({ error: validation.error }, { status: 400 });

  const call = climateActionToService(id, action, validation.value, runtime);
  try {
    await callService(call.domain, call.service, call.data);
  } catch {
    return Response.json({ error: "ha_call_failed" }, { status: 502 });
  }
  return Response.json({ ok: true });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run app/api/climate/route.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/api/climate/route.ts app/api/climate/route.test.ts
git commit -m "feat: POST /api/climate route with allowlist validation"
```

---

### Task 8: `POST /api/scene` route

**Files:**
- Create: `app/api/scene/route.ts`
- Test: `app/api/scene/route.test.ts`

**Interfaces:**
- Consumes: `callService` from `@/lib/ha-client`; `isAllowedScene` from `@/config/devices`.
- Produces: `POST(req: Request): Promise<Response>` → `{ ok: true }` (200); 400 (bad body / not allowed); 502 (HA error).

- [ ] **Step 1: Write the failing test**

Create `app/api/scene/route.test.ts`:
```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/ha-client", () => ({
  callService: vi.fn(),
  HaError: class HaError extends Error { status: number; constructor(m: string, s: number){ super(m); this.status = s; } },
}));

import { callService } from "@/lib/ha-client";
import { POST } from "@/app/api/scene/route";

function post(body: unknown): Request {
  return new Request("http://localhost/api/scene", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
}

describe("POST /api/scene", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (callService as any).mockResolvedValue(undefined);
  });

  it("activates a whitelisted scene", async () => {
    const res = await POST(post({ id: "scene.woonkamer_ontspannen" }));
    expect(res.status).toBe(200);
    expect(callService).toHaveBeenCalledWith("scene", "turn_on", { entity_id: "scene.woonkamer_ontspannen" });
  });

  it("rejects a non-whitelisted scene with 400", async () => {
    const res = await POST(post({ id: "scene.bedroom_secret" }));
    expect(res.status).toBe(400);
    expect(callService).not.toHaveBeenCalled();
  });

  it("rejects a malformed body with 400", async () => {
    const res = await POST(post({}));
    expect(res.status).toBe(400);
  });

  it("returns 502 when the HA call fails", async () => {
    const { HaError } = await import("@/lib/ha-client");
    (callService as any).mockRejectedValue(new HaError("fail", 502));
    const res = await POST(post({ id: "scene.woonkamer_uit" }));
    expect(res.status).toBe(502);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run app/api/scene/route.test.ts`
Expected: FAIL — route not found.

- [ ] **Step 3: Write the implementation**

Create `app/api/scene/route.ts`:
```ts
import { z } from "zod";
import { callService } from "@/lib/ha-client";
import { isAllowedScene } from "@/config/devices";

export const dynamic = "force-dynamic";

const bodySchema = z.object({ id: z.string() });

export async function POST(req: Request): Promise<Response> {
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "bad_request" }, { status: 400 });
  if (!isAllowedScene(parsed.data.id)) return Response.json({ error: "not_allowed" }, { status: 400 });
  try {
    await callService("scene", "turn_on", { entity_id: parsed.data.id });
  } catch {
    return Response.json({ error: "ha_call_failed" }, { status: 502 });
  }
  return Response.json({ ok: true });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run app/api/scene/route.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/api/scene/route.ts app/api/scene/route.test.ts
git commit -m "feat: POST /api/scene route"
```

---

### Task 9: Client API helpers & polling hook

**Files:**
- Create: `app/lib/api.ts`
- Create: `app/hooks/usePolling.ts`
- Test: `app/hooks/usePolling.test.tsx`

**Interfaces:**
- Consumes: `AppState` from `@/lib/types`.
- Produces:
  - `postClimate(id: string, action: string, value: boolean | string | number): Promise<boolean>` (true on 200)
  - `postScene(id: string): Promise<boolean>`
  - `usePolling(intervalMs?: number): { state: AppState | null; connected: boolean }`

- [ ] **Step 1: Write the failing test**

Create `app/hooks/usePolling.test.tsx`:
```tsx
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { usePolling } from "@/app/hooks/usePolling";

describe("usePolling", () => {
  beforeEach(() => vi.stubGlobal("fetch", vi.fn()));
  afterEach(() => vi.unstubAllGlobals());

  it("fetches state and marks connected", async () => {
    (fetch as any).mockResolvedValue({ ok: true, json: async () => ({ chills: [], thermostat: null, scenes: [] }) });
    const { result } = renderHook(() => usePolling(10_000));
    await waitFor(() => expect(result.current.state).not.toBeNull());
    expect(result.current.connected).toBe(true);
    expect(result.current.state?.chills).toEqual([]);
  });

  it("marks disconnected when the fetch fails", async () => {
    (fetch as any).mockRejectedValue(new Error("network"));
    const { result } = renderHook(() => usePolling(10_000));
    await waitFor(() => expect(result.current.connected).toBe(false));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run app/hooks/usePolling.test.tsx`
Expected: FAIL — hook not found.

- [ ] **Step 3: Write the API helpers**

Create `app/lib/api.ts`:
```ts
export async function postClimate(
  id: string,
  action: string,
  value: boolean | string | number,
): Promise<boolean> {
  try {
    const res = await fetch("/api/climate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, action, value }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function postScene(id: string): Promise<boolean> {
  try {
    const res = await fetch("/api/scene", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    return res.ok;
  } catch {
    return false;
  }
}
```

- [ ] **Step 4: Write the polling hook**

Create `app/hooks/usePolling.ts`:
```ts
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
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run app/hooks/usePolling.test.tsx`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add app/lib/api.ts app/hooks/usePolling.ts app/hooks/usePolling.test.tsx
git commit -m "feat: client API helpers and polling hook"
```

---

### Task 10: ChillCard component

**Files:**
- Create: `app/components/ChillCard.tsx`
- Test: `app/components/ChillCard.test.tsx`

**Interfaces:**
- Consumes: `ChillState` from `@/lib/types`.
- Produces: `ChillCard({ chill, onAction }: { chill: ChillState; onAction: (action: string, value: boolean | string | number) => void })`. Renders name, current temp, setpoint with −/+, Koelen/Verwarmen toggle, power, and Laag/Normaal/Hoog fan. Temperature −/+ updates a local optimistic value and calls `onAction("set_temp", v)` debounced ~400ms.

- [ ] **Step 1: Write the failing test**

Create `app/components/ChillCard.test.tsx`:
```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { ChillCard } from "@/app/components/ChillCard";
import type { ChillState } from "@/lib/types";

const chill: ChillState = {
  id: "climate.zolder_chill", name: "Zolder", available: true, on: true,
  mode: "cool", temp: 18, current: 24.4, fan: "Hoog",
  min: 16, max: 30, step: 1, fanOptions: ["Laag", "Normaal", "Hoog"],
};

describe("ChillCard", () => {
  it("renders name, current and setpoint", () => {
    render(<ChillCard chill={chill} onAction={() => {}} />);
    expect(screen.getByText("Zolder")).toBeInTheDocument();
    expect(screen.getByText(/24[.,]4/)).toBeInTheDocument();
    expect(screen.getByText("18°C")).toBeInTheDocument();
  });

  it("calls onAction set_mode heat when Verwarmen is tapped", () => {
    const onAction = vi.fn();
    render(<ChillCard chill={chill} onAction={onAction} />);
    fireEvent.click(screen.getByRole("button", { name: /Verwarmen/i }));
    expect(onAction).toHaveBeenCalledWith("set_mode", "heat");
  });

  it("calls onAction set_fan when a fan speed is tapped", () => {
    const onAction = vi.fn();
    render(<ChillCard chill={chill} onAction={onAction} />);
    fireEvent.click(screen.getByRole("button", { name: /Laag/i }));
    expect(onAction).toHaveBeenCalledWith("set_fan", "Laag");
  });

  it("calls onAction on_off=false when power is tapped while on", () => {
    const onAction = vi.fn();
    render(<ChillCard chill={chill} onAction={onAction} />);
    fireEvent.click(screen.getByRole("button", { name: /aan\/uit/i }));
    expect(onAction).toHaveBeenCalledWith("on_off", false);
  });

  it("debounces temperature changes and sends the final value", () => {
    vi.useFakeTimers();
    const onAction = vi.fn();
    render(<ChillCard chill={chill} onAction={onAction} />);
    fireEvent.click(screen.getByRole("button", { name: "+" }));
    fireEvent.click(screen.getByRole("button", { name: "+" }));
    expect(screen.getByText("20°C")).toBeInTheDocument(); // optimistic 18 -> 20
    expect(onAction).not.toHaveBeenCalledWith("set_temp", expect.anything());
    act(() => { vi.advanceTimersByTime(400); });
    expect(onAction).toHaveBeenCalledWith("set_temp", 20);
    expect(onAction).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run app/components/ChillCard.test.tsx`
Expected: FAIL — component not found.

- [ ] **Step 3: Write the implementation**

Create `app/components/ChillCard.tsx`:
```tsx
"use client";
import { useEffect, useRef, useState } from "react";
import type { ChillState } from "@/lib/types";

type Action = (action: string, value: boolean | string | number) => void;

export function ChillCard({ chill, onAction }: { chill: ChillState; onAction: Action }) {
  const [pendingTemp, setPendingTemp] = useState<number | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Reset optimistic temp when the server-confirmed value arrives.
  useEffect(() => { setPendingTemp(null); }, [chill.temp]);

  // Clear any pending debounce timer on unmount.
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const shown = pendingTemp ?? chill.temp ?? chill.min;

  function bumpTemp(delta: number) {
    const next = Math.min(chill.max, Math.max(chill.min, shown + delta * chill.step));
    setPendingTemp(next);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => onAction("set_temp", next), 400);
  }

  const disabled = !chill.available;

  return (
    <section className="rounded-2xl bg-neutral-900 p-5 text-neutral-100" aria-label={chill.name}>
      <h2 className="text-center text-lg font-medium">{chill.name}</h2>
      <p className="mt-1 text-center text-sm text-neutral-400">
        {chill.mode === "heat" ? "♨" : "❄"} {chill.current != null ? `${chill.current.toFixed(1).replace(".", ",")}°C` : "—"}
      </p>

      <div className="mt-3 flex items-center justify-center gap-6">
        <button aria-label="−" disabled={disabled} onClick={() => bumpTemp(-1)}
          className="h-12 w-12 rounded-full border border-neutral-700 text-2xl disabled:opacity-40">−</button>
        <span className="text-4xl font-semibold">{shown}°C</span>
        <button aria-label="+" disabled={disabled} onClick={() => bumpTemp(1)}
          className="h-12 w-12 rounded-full border border-neutral-700 text-2xl disabled:opacity-40">+</button>
      </div>

      <div className="mt-4 flex items-center gap-3">
        <div className="flex flex-1 rounded-full bg-neutral-800 p-1">
          <button disabled={disabled} onClick={() => onAction("set_mode", "cool")}
            aria-pressed={chill.on && chill.mode === "cool"}
            className={`flex-1 rounded-full py-2 text-sm ${chill.on && chill.mode === "cool" ? "bg-white text-black" : ""}`}>
            ❄ Koelen
          </button>
          <button disabled={disabled} onClick={() => onAction("set_mode", "heat")}
            aria-pressed={chill.on && chill.mode === "heat"}
            className={`flex-1 rounded-full py-2 text-sm ${chill.on && chill.mode === "heat" ? "bg-white text-black" : ""}`}>
            ♨ Verwarmen
          </button>
        </div>
        <button aria-label="aan/uit" disabled={disabled} onClick={() => onAction("on_off", !chill.on)}
          className={`h-11 w-11 rounded-full ${chill.on ? "bg-white text-black" : "border border-neutral-700"}`}>⏻</button>
      </div>

      <div className="mt-3 flex rounded-full bg-neutral-800 p-1">
        {chill.fanOptions.map((f) => (
          <button key={f} disabled={disabled} onClick={() => onAction("set_fan", f)}
            aria-pressed={chill.fan === f}
            className={`flex-1 rounded-full py-2 text-sm ${chill.fan === f ? "bg-white text-black" : ""}`}>
            {f}
          </button>
        ))}
      </div>
    </section>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run app/components/ChillCard.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/components/ChillCard.tsx app/components/ChillCard.test.tsx
git commit -m "feat: ChillCard component with optimistic debounced temp"
```

---

### Task 11: ThermostatCard component

**Files:**
- Create: `app/components/ThermostatCard.tsx`
- Test: `app/components/ThermostatCard.test.tsx`

**Interfaces:**
- Consumes: `ThermostatState` from `@/lib/types`.
- Produces: `ThermostatCard({ thermostat, onAction }: { thermostat: ThermostatState; onAction: (action: string, value: number) => void })`. Renders name, current temp, setpoint −/+ (debounced ~400ms, `set_temp`).

- [ ] **Step 1: Write the failing test**

Create `app/components/ThermostatCard.test.tsx`:
```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { ThermostatCard } from "@/app/components/ThermostatCard";
import type { ThermostatState } from "@/lib/types";

const thermostat: ThermostatState = {
  id: "climate.thermostaat", name: "Thermostaat", available: true,
  temp: 20, current: 19.6, min: 5, max: 30, step: 0.5,
};

describe("ThermostatCard", () => {
  it("renders the setpoint and current temp", () => {
    render(<ThermostatCard thermostat={thermostat} onAction={() => {}} />);
    expect(screen.getByText("Thermostaat")).toBeInTheDocument();
    expect(screen.getByText("20°C")).toBeInTheDocument();
    expect(screen.getByText(/19[.,]6/)).toBeInTheDocument();
  });

  it("debounces and sends the stepped setpoint", () => {
    vi.useFakeTimers();
    const onAction = vi.fn();
    render(<ThermostatCard thermostat={thermostat} onAction={onAction} />);
    fireEvent.click(screen.getByRole("button", { name: "+" })); // 20 -> 20.5
    expect(screen.getByText("20.5°C")).toBeInTheDocument();
    act(() => { vi.advanceTimersByTime(400); });
    expect(onAction).toHaveBeenCalledWith("set_temp", 20.5);
    vi.useRealTimers();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run app/components/ThermostatCard.test.tsx`
Expected: FAIL — component not found.

- [ ] **Step 3: Write the implementation**

Create `app/components/ThermostatCard.tsx`:
```tsx
"use client";
import { useEffect, useRef, useState } from "react";
import type { ThermostatState } from "@/lib/types";

export function ThermostatCard({
  thermostat,
  onAction,
}: {
  thermostat: ThermostatState;
  onAction: (action: string, value: number) => void;
}) {
  const [pending, setPending] = useState<number | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => { setPending(null); }, [thermostat.temp]);

  // Clear any pending debounce timer on unmount.
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const shown = pending ?? thermostat.temp ?? thermostat.min;
  const disabled = !thermostat.available;

  function bump(delta: number) {
    const next = Math.min(thermostat.max, Math.max(thermostat.min, shown + delta * thermostat.step));
    setPending(next);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => onAction("set_temp", next), 400);
  }

  return (
    <section className="rounded-2xl bg-neutral-900 p-5 text-neutral-100" aria-label={thermostat.name}>
      <h2 className="text-center text-lg font-medium">{thermostat.name}</h2>
      <p className="mt-1 text-center text-sm text-neutral-400">
        {thermostat.current != null ? `${thermostat.current.toFixed(1).replace(".", ",")}°C` : "—"}
      </p>
      <div className="mt-3 flex items-center justify-center gap-6">
        <button aria-label="−" disabled={disabled} onClick={() => bump(-1)}
          className="h-12 w-12 rounded-full border border-neutral-700 text-2xl disabled:opacity-40">−</button>
        <span className="text-4xl font-semibold">{shown}°C</span>
        <button aria-label="+" disabled={disabled} onClick={() => bump(1)}
          className="h-12 w-12 rounded-full border border-neutral-700 text-2xl disabled:opacity-40">+</button>
      </div>
    </section>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run app/components/ThermostatCard.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/components/ThermostatCard.tsx app/components/ThermostatCard.test.tsx
git commit -m "feat: ThermostatCard component"
```

---

### Task 12: LightScenes component

**Files:**
- Create: `app/components/LightScenes.tsx`
- Test: `app/components/LightScenes.test.tsx`

**Interfaces:**
- Consumes: `SceneRef` from `@/lib/types`.
- Produces: `LightScenes({ scenes, onScene }: { scenes: SceneRef[]; onScene: (id: string) => void })`. Renders a button per scene; click calls `onScene(id)`.

- [ ] **Step 1: Write the failing test**

Create `app/components/LightScenes.test.tsx`:
```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { LightScenes } from "@/app/components/LightScenes";

const scenes = [
  { id: "scene.woonkamer_ontspannen", name: "Ontspannen" },
  { id: "scene.woonkamer_uit", name: "Uit" },
];

describe("LightScenes", () => {
  it("renders a button per scene", () => {
    render(<LightScenes scenes={scenes} onScene={() => {}} />);
    expect(screen.getByRole("button", { name: "Ontspannen" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Uit" })).toBeInTheDocument();
  });

  it("calls onScene with the scene id on click", () => {
    const onScene = vi.fn();
    render(<LightScenes scenes={scenes} onScene={onScene} />);
    fireEvent.click(screen.getByRole("button", { name: "Ontspannen" }));
    expect(onScene).toHaveBeenCalledWith("scene.woonkamer_ontspannen");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run app/components/LightScenes.test.tsx`
Expected: FAIL — component not found.

- [ ] **Step 3: Write the implementation**

Create `app/components/LightScenes.tsx`:
```tsx
"use client";
import type { SceneRef } from "@/lib/types";

export function LightScenes({
  scenes,
  onScene,
}: {
  scenes: SceneRef[];
  onScene: (id: string) => void;
}) {
  return (
    <section className="rounded-2xl bg-neutral-900 p-5" aria-label="Verlichting woonkamer">
      <h2 className="mb-3 text-lg font-medium text-neutral-100">Woonkamer</h2>
      <div className="grid grid-cols-2 gap-3">
        {scenes.map((s) => (
          <button
            key={s.id}
            onClick={() => onScene(s.id)}
            className="rounded-xl bg-neutral-800 py-4 text-sm text-neutral-100 active:bg-neutral-700"
          >
            {s.name}
          </button>
        ))}
      </div>
    </section>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run app/components/LightScenes.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/components/LightScenes.tsx app/components/LightScenes.test.tsx
git commit -m "feat: LightScenes component"
```

---

### Task 13: ConnectionBanner + page composition

**Files:**
- Create: `app/components/ConnectionBanner.tsx`
- Test: `app/components/ConnectionBanner.test.tsx`
- Modify: `app/page.tsx` (replace scaffold content)
- Modify: `app/globals.css` (dark background) and `app/layout.tsx` (metadata, lang="nl")

**Interfaces:**
- Consumes: `usePolling` from `@/app/hooks/usePolling`; `postClimate`, `postScene` from `@/app/lib/api`; the three card components; `ConnectionBanner`.
- Produces: the visitor home screen — a client page wiring polling + actions to the cards, with an offline/disconnected banner.

- [ ] **Step 1: Write the failing test for the banner**

Create `app/components/ConnectionBanner.test.tsx`:
```tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ConnectionBanner } from "@/app/components/ConnectionBanner";

describe("ConnectionBanner", () => {
  it("renders nothing when connected", () => {
    const { container } = render(<ConnectionBanner connected={true} />);
    expect(container).toBeEmptyDOMElement();
  });
  it("shows a message when disconnected", () => {
    render(<ConnectionBanner connected={false} />);
    expect(screen.getByText(/verbinding met huis kwijt/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run app/components/ConnectionBanner.test.tsx`
Expected: FAIL — component not found.

- [ ] **Step 3: Write the banner**

Create `app/components/ConnectionBanner.tsx`:
```tsx
export function ConnectionBanner({ connected }: { connected: boolean }) {
  if (connected) return null;
  return (
    <div role="status" className="rounded-xl bg-amber-900/60 px-4 py-2 text-center text-sm text-amber-100">
      Verbinding met huis kwijt — opnieuw proberen…
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run app/components/ConnectionBanner.test.tsx`
Expected: PASS.

- [ ] **Step 5: Write the page**

Replace `app/page.tsx` with:
```tsx
"use client";
import { usePolling } from "@/app/hooks/usePolling";
import { postClimate, postScene } from "@/app/lib/api";
import { ChillCard } from "@/app/components/ChillCard";
import { ThermostatCard } from "@/app/components/ThermostatCard";
import { LightScenes } from "@/app/components/LightScenes";
import { ConnectionBanner } from "@/app/components/ConnectionBanner";

export default function Home() {
  const { state, connected } = usePolling(3000);

  return (
    <main className="mx-auto flex max-w-md flex-col gap-4 p-4">
      <ConnectionBanner connected={connected} />
      {!state ? (
        <p className="py-10 text-center text-neutral-400">Laden…</p>
      ) : (
        <>
          <LightScenes scenes={state.scenes} onScene={(id) => postScene(id)} />
          {state.thermostat && (
            <ThermostatCard
              thermostat={state.thermostat}
              onAction={(action, value) => postClimate(state.thermostat!.id, action, value)}
            />
          )}
          {state.chills.map((chill) => (
            <ChillCard
              key={chill.id}
              chill={chill}
              onAction={(action, value) => postClimate(chill.id, action, value)}
            />
          ))}
        </>
      )}
    </main>
  );
}
```

- [ ] **Step 6: Set dark theme + Dutch metadata**

In `app/globals.css`, after the Tailwind directives, ensure a dark base:
```css
:root { color-scheme: dark; }
body { background-color: #0a0a0a; color: #fafafa; }
```

Replace `app/layout.tsx` metadata/lang:
```tsx
import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Huisbediening",
  description: "Bedien verlichting en klimaat tijdens je bezoek",
  manifest: "/manifest.webmanifest",
};

export const viewport = { themeColor: "#0a0a0a" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="nl">
      <body>{children}</body>
    </html>
  );
}
```

- [ ] **Step 7: Verify build + full test suite**

Run:
```bash
npm test
npm run build
```
Expected: all tests PASS; build succeeds.

- [ ] **Step 8: Commit**

```bash
git add app/components/ConnectionBanner.tsx app/components/ConnectionBanner.test.tsx app/page.tsx app/globals.css app/layout.tsx
git commit -m "feat: compose visitor home screen with connection banner"
```

---

### Task 14: PWA — manifest, service worker, install

**Files:**
- Create: `public/manifest.webmanifest`
- Create: `public/sw.js`
- Create: `public/icons/icon-192.png`, `public/icons/icon-512.png`
- Create: `app/components/RegisterSW.tsx`
- Modify: `app/layout.tsx` (mount `RegisterSW`)
- Test: `app/components/RegisterSW.test.tsx`

**Interfaces:**
- Consumes: nothing.
- Produces: an installable PWA that caches the app shell and registers `public/sw.js`.

- [ ] **Step 1: Create the web manifest**

Create `public/manifest.webmanifest`:
```json
{
  "name": "Huisbediening",
  "short_name": "Huis",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#0a0a0a",
  "theme_color": "#0a0a0a",
  "icons": [
    { "src": "/icons/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/icons/icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "any maskable" }
  ]
}
```

- [ ] **Step 2: Create the service worker (app-shell cache, network-first for API)**

Create `public/sw.js`:
```js
const CACHE = "huis-shell-v1";
const SHELL = ["/"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))),
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  // Never cache API calls — they must hit the proxy live.
  if (url.pathname.startsWith("/api/")) return;
  if (event.request.method !== "GET") return;
  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request)),
  );
});
```

- [ ] **Step 3: Generate placeholder icons**

Run (creates simple solid PNG icons so the manifest validates; replace with branded art later):
```bash
mkdir -p public/icons
node -e "const z=require('zlib');function png(s){const sig=Buffer.from([137,80,78,71,13,10,26,10]);function chunk(t,d){const len=Buffer.alloc(4);len.writeUInt32BE(d.length);const tt=Buffer.from(t);const crcBuf=Buffer.concat([tt,d]);let c=~0;for(const b of crcBuf){c^=b;for(let i=0;i<8;i++)c=(c>>>1)^(0xEDB88320&-(c&1));}const crc=Buffer.alloc(4);crc.writeUInt32BE((~c)>>>0);return Buffer.concat([len,tt,d,crc]);}const ihdr=Buffer.alloc(13);ihdr.writeUInt32BE(s,0);ihdr.writeUInt32BE(s,4);ihdr[8]=8;ihdr[9]=2;const row=Buffer.concat([Buffer.from([0]),Buffer.concat(Array.from({length:s},()=>Buffer.from([10,10,10])))]);const raw=Buffer.concat(Array.from({length:s},()=>row));const idat=z.deflateSync(raw);return Buffer.concat([sig,chunk('IHDR',ihdr),chunk('IDAT',idat),chunk('IEND',Buffer.alloc(0))]);}require('fs').writeFileSync('public/icons/icon-192.png',png(192));require('fs').writeFileSync('public/icons/icon-512.png',png(512));console.log('icons written');"
```
Expected: `icons written`, and two PNG files exist.

- [ ] **Step 4: Write the failing test for SW registration**

Create `app/components/RegisterSW.test.tsx`:
```tsx
import { describe, it, expect, vi, afterEach } from "vitest";
import { render } from "@testing-library/react";
import { RegisterSW } from "@/app/components/RegisterSW";

afterEach(() => vi.unstubAllGlobals());

describe("RegisterSW", () => {
  it("registers the service worker when supported", () => {
    const register = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { serviceWorker: { register } });
    render(<RegisterSW />);
    expect(register).toHaveBeenCalledWith("/sw.js");
  });

  it("does nothing when service workers are unsupported", () => {
    vi.stubGlobal("navigator", {});
    expect(() => render(<RegisterSW />)).not.toThrow();
  });
});
```

- [ ] **Step 5: Run test to verify it fails**

Run: `npx vitest run app/components/RegisterSW.test.tsx`
Expected: FAIL — component not found.

- [ ] **Step 6: Write the registrar**

Create `app/components/RegisterSW.tsx`:
```tsx
"use client";
import { useEffect } from "react";

export function RegisterSW() {
  useEffect(() => {
    if (typeof navigator !== "undefined" && "serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }
  }, []);
  return null;
}
```

Note: the test asserts synchronously after `render()`. In React Testing Library, `render` wraps in `act()` and flushes effects before returning, so the `useEffect` registration has already run by the time the assertion executes — no render-body side effect is needed.

- [ ] **Step 7: Mount the registrar in the layout**

In `app/layout.tsx`, import and render `RegisterSW` inside `<body>`:
```tsx
import { RegisterSW } from "@/app/components/RegisterSW";
// ...
      <body>
        <RegisterSW />
        {children}
      </body>
```

- [ ] **Step 8: Run tests + build**

Run:
```bash
npx vitest run app/components/RegisterSW.test.tsx
npm run build
```
Expected: PASS; build succeeds.

- [ ] **Step 9: Commit**

```bash
git add public/manifest.webmanifest public/sw.js public/icons app/components/RegisterSW.tsx app/components/RegisterSW.test.tsx app/layout.tsx
git commit -m "feat: PWA manifest, service worker and registration"
```

---

### Task 15: Deployment — Docker, compose, env, README

**Files:**
- Create: `Dockerfile`
- Create: `docker-compose.yml`
- Create: `.env.example`
- Create: `README.md`
- Modify: `next.config.mjs` (standalone output)
- Modify: `.gitignore` (ensure `.env*` ignored)

**Interfaces:**
- Consumes: the whole app.
- Produces: a runnable container reachable on the LAN; documented setup.

- [ ] **Step 1: Enable standalone output**

In `next.config.mjs`, set:
```js
/** @type {import('next').NextConfig} */
const nextConfig = { output: "standalone" };
export default nextConfig;
```

- [ ] **Step 2: Write the Dockerfile**

Create `Dockerfile`:
```dockerfile
FROM node:24-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:24-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:24-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
EXPOSE 3000
CMD ["node", "server.js"]
```

- [ ] **Step 3: Write docker-compose + env example**

Create `docker-compose.yml`:
```yaml
services:
  home-control:
    build: .
    restart: unless-stopped
    ports:
      - "3000:3000"
    environment:
      HA_URL: ${HA_URL}
      HA_TOKEN: ${HA_TOKEN}
```

Create `.env.example`:
```bash
# Base URL of your Home Assistant instance (no trailing slash)
HA_URL=http://homeassistant.local:8123
# Long-lived access token created in HA: Profile -> Security -> Long-lived access tokens
HA_TOKEN=replace-me
```

- [ ] **Step 4: Ensure secrets are git-ignored**

Confirm `.gitignore` contains `.env*` (create-next-app adds `.env*`; if absent, append it). Verify `.env.example` is NOT ignored:
```bash
git check-ignore .env.example || echo "env.example tracked OK"
```
Expected: prints `env.example tracked OK`.

- [ ] **Step 5: Write the README**

Create `README.md`:
```markdown
# Huisbediening (Visitor Home Control)

Lokale PWA waarmee bezoekers verlichting (woonkamer Hue-scenes), de thermostaat en
de Quatt Chills (Zolder + Speelkamer) bedienen via Home Assistant. Geen app-installatie.

## Vereisten
- Home Assistant op het LAN, met de Quatt-integratie + **Remote API** ingeschakeld
  (eenmalig CiC-knop pairen) zodat de Chill-`climate`-entities bestuurbaar zijn.
- Een long-lived access token uit HA.

## Setup
1. `cp .env.example .env` en vul `HA_URL` + `HA_TOKEN` in.
2. Pas de echte entity-id's aan in `config/devices.ts` (zie "Entity-id's ontdekken").
3. `docker compose up -d --build`
4. Open `http://<host>:3000` (zet er een reverse proxy met HTTPS voor i.v.m. PWA/iOS).
5. Maak een QR-code naar de HTTPS-URL voor bezoekers.

## Entity-id's ontdekken
In HA → Developer Tools → States. Zoek de `climate.*`-entities van de twee Chills en
de thermostaat, en de `scene.*`-entities van de 8 woonkamer-scenes. Zet die ids in
`config/devices.ts`.

## Tests
`npm test`
```

- [ ] **Step 6: Build the image to verify**

Run:
```bash
docker build -t home-control .
```
Expected: image builds successfully.

- [ ] **Step 7: Commit**

```bash
git add Dockerfile docker-compose.yml .env.example README.md next.config.mjs .gitignore
git commit -m "chore: dockerized deployment and setup docs"
```

---

### Task 16: Real-HA acceptance & entity wiring

**Files:**
- Modify: `config/devices.ts` (real entity ids)

**Interfaces:**
- Consumes: a running HA with the Quatt Remote API enabled.
- Produces: verified end-to-end control against real devices.

- [ ] **Step 1: Discover real entity ids**

In HA → Developer Tools → States, record the actual ids for: the two Chills, the thermostat, and the 8 woonkamer Hue scenes. (If not yet enabled, turn on the Quatt integration's Remote API and pair via the CiC button so the Chill `climate` entities appear and are controllable.)

- [ ] **Step 2: Update the allowlist**

Replace the placeholder ids in `config/devices.ts` with the real ones discovered in Step 1. Re-run the config test to confirm shape still holds:
```bash
npx vitest run config/devices.test.ts
```
Expected: PASS (the test asserts counts/names, not specific placeholder ids).

- [ ] **Step 3: Manual acceptance against real HA**

With `.env` filled and the app running (`docker compose up -d --build`), open the PWA on a phone on the LAN and verify each:
  - Each Chill (Zolder, Speelkamer): power on/off, Koelen↔Verwarmen, Laag/Normaal/Hoog, and −/+ temperature each visibly change the unit (cross-check in the Quatt app).
  - Thermostat −/+ moves the setpoint in HA.
  - Each of the 8 Hue scenes activates the woonkamer lights; "Uit" turns them off.
  - Pull the HA host offline briefly → the "Verbinding met huis kwijt" banner appears; restore → it clears within ~3s.

- [ ] **Step 4: Commit the real ids**

```bash
git add config/devices.ts
git commit -m "chore: wire real Home Assistant entity ids"
```

---

## Self-Review

**Spec coverage:**
- §4 architecture (Next.js app + proxy + HA) → Tasks 1, 6–8.
- §5 components (frontend, backend, HA-config) → Tasks 9–13 (frontend), 4/6–8 (backend), 15/16 (HA-config docs + wiring).
- §6 config/whitelist → Task 2.
- §7 API contract (state/climate/scene + status codes) → Tasks 6, 7, 8.
- §8 screen layout (Chill card mirrors Quatt UI, thermostat, 8 Hue scenes) → Tasks 10–13.
- §9 data flow (poll + optimistic + debounce) → Tasks 9, 10, 11.
- §10 error handling (HA down banner, per-block failure, debounce, 400/502) → Tasks 6–9, 13.
- §11 security (token server-side, allowlist, server-side validation) → Tasks 2, 3, 7, 8, 15.
- §12 deployment (Docker, env, HTTPS note, QR) → Task 15.
- §13 testing strategy (validation-first TDD, mocked HA client, mapping, components, manual acceptance) → all tasks + Task 16.
- §14 assumptions (Remote API on, discover ids, thermostat temp-only, bounds from entity) → Tasks 15/16 docs, Task 2 (thermostat actions = `set_temp` only), Task 5 (bounds from attributes).

No spec requirement is left without a task.

**Placeholder scan:** No "TBD/TODO" steps; every code/command step contains concrete content. The placeholder *entity ids* in `config/devices.ts` are intentional and explicitly resolved in Task 16.

**Type consistency:** `AppState`/`ChillState`/`ThermostatState`/`SceneRef`/`HaEntityState` defined in Task 2 are consumed unchanged in Tasks 3–13. `ClimateRuntime`, `validateClimateValue`, `climateActionToService` (Task 3) are used with matching signatures in Task 7. `getStates`/`callService`/`HaError` (Task 4) are used identically in Tasks 6–8. `mapHaStatesToAppState`/`findClimateRuntime` (Task 5) used as defined in Tasks 6, 7. `postClimate`/`postScene`/`usePolling` (Task 9) used as defined in Task 13. Card prop shapes (Tasks 10–12) match their usage in Task 13.
