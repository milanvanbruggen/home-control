# Room Metric Widgets Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show configurable per-room environmental widgets (temperature, humidity) on the home screen, toggleable per room/metric in Settings.

**Architecture:** A curated `ROOM_METRICS` config maps each room to its HA sensor entities. The state-mapper reads those entities from the existing `/api/states` payload and emits an `AppState.metrics` array with live values plus a server-computed `visible` flag (from a `hiddenMetrics` deny-list in settings). The home page renders one `RoomMetricCard` per room in the existing masonry grid; the settings page renders one `Switch` per room/metric that writes the deny-list back.

**Tech Stack:** Next.js (App Router, client components), TypeScript, Tailwind v4, Radix Switch, Zod (settings schema), Vitest + Testing Library, lucide-react icons.

## Global Constraints

- **Spec:** `docs/superpowers/specs/2026-06-25-room-metric-widgets-design.md`.
- **No new deps.** Use what the repo already has.
- **Metric kinds (now):** `temperature`, `humidity` only. Keep the model extensible.
- **Default visibility = ON.** Settings store a **deny-list** (`hiddenMetrics: roomKey → kind[]`); empty = everything visible.
- **NL number format:** temperature one decimal with a comma (e.g. `21,4°C`); humidity integer (e.g. `48%`); `—` when the value is null.
- **Keep both known-duplicate rooms** (Kamer Bas / Slaapkamer Bas, and Woonkamer-temp): they ship visible; the user toggles them off.
- **Existing 190 tests must stay green.** Two of them assert the full settings object by equality — they are updated in Tasks 2 and 3.
- **Git:** this checkout is not a git repository, so the usual per-task `git commit` step is replaced by a "run the full suite" checkpoint. If you `git init`, commit after each green checkpoint instead.
- **Run a single test file:** `npx vitest run <path>`. **Full suite:** `npm test`. **Lint:** `npx eslint <path>`. **Build:** `npm run build`.

---

### Task 1: Metric types + `ROOM_METRICS` config

**Files:**
- Modify: `lib/types.ts`
- Modify: `config/devices.ts`
- Test: `config/devices.test.ts`

**Interfaces:**
- Consumes: nothing (foundation task).
- Produces:
  - `lib/types.ts`: `type MetricKind = "temperature" | "humidity"`; `interface MetricSensor { kind: MetricKind; entityId: string }`; `interface MetricValue { kind: MetricKind; value: number | null; unit: string; visible: boolean }`; `interface RoomMetrics { key: string; name: string; metrics: MetricValue[] }`; `AppState.metrics: RoomMetrics[]`; `AppSettings.hiddenMetrics: Record<string, string[]>`.
  - `config/devices.ts`: `interface MetricRoom { key: string; name: string; sensors: readonly MetricSensor[] }`; `const METRIC_KINDS: readonly MetricKind[]`; `const ROOM_METRICS: readonly MetricRoom[]`; `const METRIC_ROOM_KEYS: ReadonlySet<string>`.

- [ ] **Step 1: Add the failing config test**

Append to `config/devices.test.ts` (add `ROOM_METRICS, METRIC_KINDS, METRIC_ROOM_KEYS` to the existing import from `@/config/devices`):

```ts
describe("room metrics config", () => {
  it("defines metric kinds temperature + humidity", () => {
    expect(METRIC_KINDS).toEqual(["temperature", "humidity"]);
  });

  it("has unique room keys, each with sensor.* entities of known kinds", () => {
    const keys = ROOM_METRICS.map((r) => r.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const room of ROOM_METRICS) {
      expect(room.name.length).toBeGreaterThan(0);
      expect(room.sensors.length).toBeGreaterThan(0);
      for (const s of room.sensors) {
        expect(s.entityId.startsWith("sensor.")).toBe(true);
        expect(METRIC_KINDS).toContain(s.kind);
      }
    }
  });

  it("includes woonkamer (temp+humidity) and an outdoor temperature room", () => {
    const wk = ROOM_METRICS.find((r) => r.key === "woonkamer");
    expect(wk?.sensors.map((s) => s.kind)).toEqual(["temperature", "humidity"]);
    const buiten = ROOM_METRICS.find((r) => r.key === "buiten");
    expect(buiten?.sensors[0].entityId).toBe("sensor.home_outdoor_temperature");
  });

  it("exposes the room keys as a set", () => {
    expect(METRIC_ROOM_KEYS.has("woonkamer")).toBe(true);
    expect(METRIC_ROOM_KEYS.has("nope")).toBe(false);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run config/devices.test.ts`
Expected: FAIL — `ROOM_METRICS`/`METRIC_KINDS`/`METRIC_ROOM_KEYS` are not exported.

- [ ] **Step 3: Add the types**

In `lib/types.ts`, add near the other interfaces (after `ClimateDeviceConfig`):

```ts
export type MetricKind = "temperature" | "humidity";

export interface MetricSensor {
  kind: MetricKind;
  entityId: string;
}

/** A live metric value as sent to the client. */
export interface MetricValue {
  kind: MetricKind;
  value: number | null; // raw reading; null = unavailable/unknown/missing
  unit: string;         // from HA unit_of_measurement, fallback per kind
  visible: boolean;     // server-computed from settings.hiddenMetrics
}

export interface RoomMetrics {
  key: string;
  name: string;
  metrics: MetricValue[];
}
```

In the same file, extend `AppState` and `AppSettings`:

```ts
export interface AppState {
  chills: ChillState[];
  thermostat: ThermostatState | null;
  rooms: RoomState[];
  metrics: RoomMetrics[];
}
```

```ts
export interface AppSettings {
  language: Language;
  theme: Theme;
  favorites: Record<string, string[]>;
  waterAlert: boolean;
  /** Deny-list of hidden metric widgets: room key → hidden metric kinds. */
  hiddenMetrics: Record<string, string[]>;
}
```

- [ ] **Step 4: Add the config**

In `config/devices.ts`, change the top import to include the metric types:

```ts
import type { ClimateDeviceConfig, MetricKind, MetricSensor } from "@/lib/types";
```

Append at the end of the file:

```ts
/**
 * Environmental metric sensors per room, surfaced as home-screen widgets.
 * Entity ids are the real Home Assistant sensors. Keys reuse the Hue room key
 * where it's the same physical room; new keys (kamer_bas/zolder/speelkamer/buiten)
 * are metric-only. Add a sensor here and it appears (visible by default).
 */
export interface MetricRoom {
  key: string;
  name: string;
  sensors: readonly MetricSensor[];
}

export const METRIC_KINDS: readonly MetricKind[] = ["temperature", "humidity"];

export const ROOM_METRICS: readonly MetricRoom[] = [
  { key: "woonkamer", name: "Woonkamer", sensors: [
    { kind: "temperature", entityId: "sensor.woonkamer_woonkamer_temperature" },
    { kind: "humidity",    entityId: "sensor.woonkamer_woonkamer_humidity" },
  ] },
  { key: "slaapkamer", name: "Slaapkamer", sensors: [
    { kind: "temperature", entityId: "sensor.slaapkamer_maartje_en_milan_slaapkamer_maartje_en_milan_temperature" },
    { kind: "humidity",    entityId: "sensor.slaapkamer_maartje_en_milan_slaapkamer_maartje_en_milan_humidity" },
  ] },
  { key: "slaapkamer_bas", name: "Slaapkamer Bas", sensors: [
    { kind: "temperature", entityId: "sensor.slaapkamer_bas_slaapkamer_bas_temperature" },
    { kind: "humidity",    entityId: "sensor.slaapkamer_bas_slaapkamer_bas_humidity" },
  ] },
  { key: "slaapkamer_thijs", name: "Slaapkamer Thijs", sensors: [
    { kind: "temperature", entityId: "sensor.slaapkamer_thijs_slaapkamer_thijs_temperature" },
    { kind: "humidity",    entityId: "sensor.slaapkamer_thijs_slaapkamer_thijs_humidity" },
  ] },
  { key: "kamer_bas", name: "Kamer Bas", sensors: [
    { kind: "temperature", entityId: "sensor.kamer_bas_temperatuur" },
    { kind: "humidity",    entityId: "sensor.kamer_bas_luchtvochtigheid" },
  ] },
  { key: "zolder", name: "Zolder", sensors: [
    { kind: "temperature", entityId: "sensor.zolder_ambient_temperature" },
  ] },
  { key: "speelkamer", name: "Speelkamer", sensors: [
    { kind: "temperature", entityId: "sensor.speelkamer_ambient_temperature" },
  ] },
  { key: "buiten", name: "Buiten", sensors: [
    { kind: "temperature", entityId: "sensor.home_outdoor_temperature" },
  ] },
];

export const METRIC_ROOM_KEYS: ReadonlySet<string> = new Set(ROOM_METRICS.map((r) => r.key));
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run config/devices.test.ts`
Expected: PASS.

- [ ] **Step 6: Checkpoint — typecheck the new types**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: FAILS in `lib/state-mapper.ts` only (AppState now requires `metrics`) and `lib/settings-store.ts` (AppSettings now requires `hiddenMetrics`). That is expected and fixed in Tasks 2 and 4. No other errors.

---

### Task 2: Settings store — `hiddenMetrics` deny-list

**Files:**
- Modify: `lib/settings-store.ts`
- Test: `lib/settings-store.test.ts`

**Interfaces:**
- Consumes: `AppSettings.hiddenMetrics` (Task 1); `METRIC_KINDS`, `METRIC_ROOM_KEYS` from `@/config/devices` (Task 1).
- Produces: `getSettings().hiddenMetrics: Record<string,string[]>`; `updateSettings({ hiddenMetrics })` round-trips and sanitizes.

- [ ] **Step 1: Update the two equality assertions + add deny-list tests**

In `lib/settings-store.test.ts`, change the "returns defaults" expectation to include the new field:

```ts
  it("returns defaults when no file exists", () => {
    expect(getSettings()).toEqual({ language: "en", theme: "system", favorites: {}, waterAlert: true, hiddenMetrics: {} });
  });
```

Then append:

```ts
  it("keeps only known metric rooms + known metric kinds in hiddenMetrics", () => {
    updateSettings({
      hiddenMetrics: { woonkamer: ["humidity", "bogus"], nope: ["temperature"] } as never,
    });
    _resetSettingsCache();
    expect(getSettings().hiddenMetrics).toEqual({ woonkamer: ["humidity"] });
  });

  it("round-trips a hiddenMetrics update and merges with other fields", () => {
    updateSettings({ theme: "dark" });
    updateSettings({ hiddenMetrics: { zolder: ["temperature"] } });
    _resetSettingsCache();
    expect(getSettings()).toMatchObject({ theme: "dark", hiddenMetrics: { zolder: ["temperature"] } });
  });
```

- [ ] **Step 2: Run and watch it fail**

Run: `npx vitest run lib/settings-store.test.ts`
Expected: FAIL — defaults lack `hiddenMetrics`; sanitize ignores it.

- [ ] **Step 3: Implement in `lib/settings-store.ts`**

Add to the imports at the top:

```ts
import { ROOMS, METRIC_KINDS, METRIC_ROOM_KEYS } from "@/config/devices";
```

(Replace the existing `import { ROOMS } from "@/config/devices";` line.)

Change `defaults()`:

```ts
function defaults(): AppSettings {
  return { language: "en", theme: "system", favorites: {}, waterAlert: true, hiddenMetrics: {} };
}
```

In `sanitize()`, immediately before `return out;`, add:

```ts
  if (r.hiddenMetrics && typeof r.hiddenMetrics === "object" && !Array.isArray(r.hiddenMetrics)) {
    for (const [key, value] of Object.entries(r.hiddenMetrics as Record<string, unknown>)) {
      if (METRIC_ROOM_KEYS.has(key) && Array.isArray(value)) {
        const kinds = value.filter(
          (x): x is string => typeof x === "string" && (METRIC_KINDS as readonly string[]).includes(x),
        );
        if (kinds.length) out.hiddenMetrics[key] = kinds;
      }
    }
  }
```

In `updateSettings()`, add `hiddenMetrics` to the merged object passed to `sanitize`:

```ts
  const merged = sanitize({
    language: patch.language ?? current.language,
    theme: patch.theme ?? current.theme,
    favorites: patch.favorites ?? current.favorites,
    waterAlert: patch.waterAlert ?? current.waterAlert,
    hiddenMetrics: patch.hiddenMetrics ?? current.hiddenMetrics,
  });
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run lib/settings-store.test.ts`
Expected: PASS.

- [ ] **Step 5: Checkpoint**

Run: `npm test`
Expected: every test passes EXCEPT the `/api/settings` route test's "GET returns the defaults" (it still asserts the old object) — that is fixed in Task 3. If any OTHER test fails, stop and investigate.

---

### Task 3: Settings API accepts `hiddenMetrics`

**Files:**
- Modify: `app/api/settings/route.ts`
- Test: `app/api/settings/route.test.ts`

**Interfaces:**
- Consumes: `updateSettings`/`getSettings` (Task 2).
- Produces: `PUT /api/settings` accepts `{ hiddenMetrics: Record<string,string[]> }`.

- [ ] **Step 1: Update the defaults assertion + add a PUT test**

In `app/api/settings/route.test.ts`, update the GET-defaults expectation:

```ts
    expect(await res.json()).toEqual({ language: "en", theme: "system", favorites: {}, waterAlert: true, hiddenMetrics: {} });
```

Append a test:

```ts
  it("PUT updates hiddenMetrics and persists", async () => {
    const res = await PUT(put({ hiddenMetrics: { woonkamer: ["humidity"] } }));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ hiddenMetrics: { woonkamer: ["humidity"] } });
    _resetSettingsCache();
    expect((await (await GET()).json()).hiddenMetrics).toEqual({ woonkamer: ["humidity"] });
  });
```

- [ ] **Step 2: Run and watch it fail**

Run: `npx vitest run app/api/settings/route.test.ts`
Expected: FAIL — schema strips `hiddenMetrics`, so it never persists.

- [ ] **Step 3: Add the schema field**

In `app/api/settings/route.ts`, add one line to `patchSchema`:

```ts
const patchSchema = z.object({
  language: z.enum(["en", "nl"]).optional(),
  theme: z.enum(["light", "dark", "system"]).optional(),
  favorites: z.record(z.string(), z.array(z.string())).optional(),
  waterAlert: z.boolean().optional(),
  hiddenMetrics: z.record(z.string(), z.array(z.string())).optional(),
});
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run app/api/settings/route.test.ts`
Expected: PASS.

- [ ] **Step 5: Checkpoint**

Run: `npm test`
Expected: all pass except `lib/state-mapper.ts` may still break `tsc`; the vitest run itself should be green now. (Type errors surface in Task 4's build, not in `npm test` which is type-stripped by Vitest.) If a runtime test fails, stop.

---

### Task 4: State mapper — `mapMetrics` + threaded `hiddenMetrics`

**Files:**
- Modify: `lib/state-mapper.ts`
- Test: `lib/state-mapper.test.ts`

**Interfaces:**
- Consumes: `ROOM_METRICS` (Task 1); `MetricValue`, `RoomMetrics`, `MetricKind` (Task 1).
- Produces: `mapHaStatesToAppState(states, activeScenes?, favorites?, sceneGradients?, hiddenMetrics?)` now returns `AppState` including `metrics: RoomMetrics[]`. The new 5th param defaults to `{}`.

- [ ] **Step 1: Add failing metric-mapping tests**

In `lib/state-mapper.test.ts`, add metric sensors to the shared `states` fixture (insert before the closing `]` of the array, e.g. after the light groups):

```ts
  { entity_id: "sensor.woonkamer_woonkamer_temperature", state: "21.4", attributes: { unit_of_measurement: "°C", device_class: "temperature" } },
  { entity_id: "sensor.woonkamer_woonkamer_humidity", state: "48", attributes: { unit_of_measurement: "%", device_class: "humidity" } },
  { entity_id: "sensor.zolder_ambient_temperature", state: "unavailable", attributes: {} },
```

Append a describe block:

```ts
describe("mapHaStatesToAppState metrics", () => {
  function metricsRoom(app: { metrics: { key: string; name: string; metrics: { kind: string; value: number | null; unit: string; visible: boolean }[] }[] }, key: string) {
    const r = app.metrics.find((m) => m.key === key);
    if (!r) throw new Error(`metric room ${key} missing`);
    return r;
  }

  it("maps temperature + humidity values and units from HA state", () => {
    const wk = metricsRoom(mapHaStatesToAppState(states), "woonkamer");
    expect(wk.metrics).toEqual([
      { kind: "temperature", value: 21.4, unit: "°C", visible: true },
      { kind: "humidity", value: 48, unit: "%", visible: true },
    ]);
  });

  it("yields a null value for unavailable/missing sensors but keeps the metric", () => {
    const app = mapHaStatesToAppState(states);
    expect(metricsRoom(app, "zolder").metrics[0]).toEqual({ kind: "temperature", value: null, unit: "°C", visible: true });
    // 'buiten' sensor isn't in the fixture at all → null with the fallback unit
    expect(metricsRoom(app, "buiten").metrics[0]).toMatchObject({ value: null, unit: "°C" });
  });

  it("marks a metric hidden when hiddenMetrics lists its kind for that room", () => {
    const app = mapHaStatesToAppState(states, {}, {}, {}, { woonkamer: ["humidity"] });
    const wk = metricsRoom(app, "woonkamer");
    expect(wk.metrics.find((m) => m.kind === "temperature")?.visible).toBe(true);
    expect(wk.metrics.find((m) => m.kind === "humidity")?.visible).toBe(false);
  });
});
```

- [ ] **Step 2: Run and watch it fail**

Run: `npx vitest run lib/state-mapper.test.ts`
Expected: FAIL — `app.metrics` is undefined; `mapHaStatesToAppState` ignores the 5th arg.

- [ ] **Step 3: Implement `mapMetrics` and thread the param**

In `lib/state-mapper.ts`, extend the imports:

```ts
import type { AppState, ChillState, ThermostatState, HaEntityState, HvacMode, ClimateDeviceConfig, RoomState, SceneRef, MetricValue, RoomMetrics, MetricKind } from "@/lib/types";
import { CHILLS, THERMOSTAT, ROOMS, ROOM_METRICS, defaultFavorites, type Room } from "@/config/devices";
```

Add a fallback-unit map and the mapper near the other helpers (e.g. above `mapHaStatesToAppState`):

```ts
const METRIC_UNIT_FALLBACK: Record<MetricKind, string> = { temperature: "°C", humidity: "%" };

/** Build the per-room metric widgets from the configured sensors + the hidden deny-list. */
function mapMetrics(byId: Map<string, HaEntityState>, hidden: Record<string, string[]>): RoomMetrics[] {
  return ROOM_METRICS.map((room) => {
    const hiddenKinds = hidden[room.key] ?? [];
    const metrics: MetricValue[] = room.sensors.map((s) => {
      const e = byId.get(s.entityId);
      const usable = !!e && e.state !== "unavailable" && e.state !== "unknown";
      const parsed = usable ? Number(e!.state) : NaN;
      const value = Number.isNaN(parsed) ? null : parsed;
      const unitAttr = e?.attributes.unit_of_measurement;
      const unit = typeof unitAttr === "string" ? unitAttr : METRIC_UNIT_FALLBACK[s.kind];
      return { kind: s.kind, value, unit, visible: !hiddenKinds.includes(s.kind) };
    });
    return { key: room.key, name: room.name, metrics };
  });
}
```

Update the signature and return of `mapHaStatesToAppState`:

```ts
export function mapHaStatesToAppState(
  states: HaEntityState[],
  activeScenes: Record<string, string | null> = {},
  favorites: Record<string, string[]> = {},
  sceneGradients: Record<string, string> = {},
  hiddenMetrics: Record<string, string[]> = {},
): AppState {
  const byId = new Map(states.map((s) => [s.entity_id, s]));
  return {
    chills: CHILLS.map((c) => mapChill(c, byId)),
    thermostat: mapThermostat(byId),
    rooms: ROOMS.map((r) => mapRoom(r, byId, states, activeScenes, favorites, sceneGradients)),
    metrics: mapMetrics(byId, hiddenMetrics),
  };
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run lib/state-mapper.test.ts`
Expected: PASS.

- [ ] **Step 5: Checkpoint — types now resolve**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: PASS (AppState.metrics is now produced; AppSettings.hiddenMetrics handled in Task 2).

---

### Task 5: Wire `hiddenMetrics` into `/api/state`

**Files:**
- Modify: `app/api/state/route.ts`

**Interfaces:**
- Consumes: `mapHaStatesToAppState(..., hiddenMetrics)` (Task 4); `getSettings()` (Task 2).
- Produces: `/api/state` response includes `metrics` filtered by the user's settings.

- [ ] **Step 1: Hoist settings and pass `hiddenMetrics`**

Replace the body of `GET` in `app/api/state/route.ts` so settings are read once:

```ts
export async function GET(): Promise<Response> {
  try {
    const [states, sceneGradients] = await Promise.all([getStates(), getSceneGradients()]);
    const activeScenes = Object.fromEntries(ROOMS.map((r) => [r.key, getActiveScene(r.key)]));
    const settings = getSettings();
    return Response.json(
      mapHaStatesToAppState(states, activeScenes, settings.favorites, sceneGradients, settings.hiddenMetrics),
    );
  } catch (e) {
    return Response.json({ error: "state_unavailable" }, { status: statusForError(e) });
  }
}
```

- [ ] **Step 2: Checkpoint — existing route test still passes**

Run: `npx vitest run app/api/state/route.test.ts`
Expected: PASS (assertions are field-level; `metrics` is additive).

---

### Task 6: i18n keys

**Files:**
- Modify: `lib/i18n.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `MsgKey` gains `settings.widgets`, `settings.widgetsHint`, `metric.temperature`, `metric.humidity` (used by Tasks 7 and 9).

- [ ] **Step 1: Add the keys to both `en` and `nl`**

In `lib/i18n.ts`, add to the `en` object (e.g. after `"settings.favoritesHint"`):

```ts
  "settings.widgets": "Widgets",
  "settings.widgetsHint": "Choose which readings to show per room.",
  "metric.temperature": "Temperature",
  "metric.humidity": "Humidity",
```

Add the matching entries to the `nl` object (e.g. after its `"settings.favoritesHint"`):

```ts
  "settings.widgets": "Widgets",
  "settings.widgetsHint": "Kies welke meetwaarden je per kamer toont.",
  "metric.temperature": "Temperatuur",
  "metric.humidity": "Luchtvochtigheid",
```

- [ ] **Step 2: Checkpoint — translations + types**

Run: `npx vitest run lib/i18n.test.ts && npx tsc --noEmit -p tsconfig.json`
Expected: PASS. (`nl` is typed `Record<MsgKey,string>`, so a missing translation would be a type error.)

---

### Task 7: `RoomMetricCard` + shared formatter

**Files:**
- Create: `lib/metrics.ts`
- Create: `app/components/RoomMetricCard.tsx`
- Test: `lib/metrics.test.ts`
- Test: `app/components/RoomMetricCard.test.tsx`

**Interfaces:**
- Consumes: `RoomMetrics`, `MetricValue`, `MetricKind` (Task 1); metric i18n keys (Task 6).
- Produces: `formatMetricValue(m: MetricValue): string` and `METRIC_LABEL_KEY: Record<MetricKind, MsgKey>` from `@/lib/metrics`; `RoomMetricCard({ room: RoomMetrics })` from `@/app/components/RoomMetricCard` (renders `null` when no metric is visible).

- [ ] **Step 1: Failing formatter test**

Create `lib/metrics.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { formatMetricValue } from "@/lib/metrics";

describe("formatMetricValue", () => {
  it("formats temperature with one decimal and a comma", () => {
    expect(formatMetricValue({ kind: "temperature", value: 21.4, unit: "°C", visible: true })).toBe("21,4°C");
    expect(formatMetricValue({ kind: "temperature", value: 19, unit: "°C", visible: true })).toBe("19,0°C");
  });

  it("formats humidity as a rounded integer", () => {
    expect(formatMetricValue({ kind: "humidity", value: 48.6, unit: "%", visible: true })).toBe("49%");
  });

  it("returns an em dash for a null value", () => {
    expect(formatMetricValue({ kind: "temperature", value: null, unit: "°C", visible: true })).toBe("—");
  });
});
```

- [ ] **Step 2: Run and watch it fail**

Run: `npx vitest run lib/metrics.test.ts`
Expected: FAIL — `@/lib/metrics` does not exist.

- [ ] **Step 3: Implement `lib/metrics.ts`**

```ts
import type { MetricKind, MetricValue } from "@/lib/types";
import type { MsgKey } from "@/lib/i18n";

/** i18n key for each metric kind's label. */
export const METRIC_LABEL_KEY: Record<MetricKind, MsgKey> = {
  temperature: "metric.temperature",
  humidity: "metric.humidity",
};

/** Display string: temperature one decimal (NL comma), humidity integer; "—" when null. */
export function formatMetricValue(m: MetricValue): string {
  if (m.value == null) return "—";
  const n = m.kind === "temperature" ? m.value.toFixed(1).replace(".", ",") : String(Math.round(m.value));
  return `${n}${m.unit}`;
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run lib/metrics.test.ts`
Expected: PASS.

- [ ] **Step 5: Failing component test**

Create `app/components/RoomMetricCard.test.tsx`:

```tsx
import { describe, it, expect } from "vitest";
import { render as rtlRender, screen } from "@testing-library/react";
import type { ReactElement, ReactNode } from "react";
import { RoomMetricCard } from "@/app/components/RoomMetricCard";
import { LanguageProvider } from "@/app/components/LanguageProvider";
import type { RoomMetrics } from "@/lib/types";

function NL({ children }: { children: ReactNode }) {
  return <LanguageProvider initial="nl">{children}</LanguageProvider>;
}
const render = (ui: ReactElement) => rtlRender(ui, { wrapper: NL });

const room: RoomMetrics = {
  key: "woonkamer", name: "Woonkamer",
  metrics: [
    { kind: "temperature", value: 21.4, unit: "°C", visible: true },
    { kind: "humidity", value: 48, unit: "%", visible: true },
  ],
};

describe("RoomMetricCard", () => {
  it("renders the room name, values and Dutch labels", () => {
    render(<RoomMetricCard room={room} />);
    expect(screen.getByText("Woonkamer")).toBeInTheDocument();
    expect(screen.getByText("21,4°C")).toBeInTheDocument();
    expect(screen.getByText("48%")).toBeInTheDocument();
    expect(screen.getByText("Temperatuur")).toBeInTheDocument();
    expect(screen.getByText("Luchtvochtigheid")).toBeInTheDocument();
  });

  it("omits metrics whose visible is false", () => {
    render(<RoomMetricCard room={{ ...room, metrics: [
      { kind: "temperature", value: 21.4, unit: "°C", visible: true },
      { kind: "humidity", value: 48, unit: "%", visible: false },
    ] }} />);
    expect(screen.getByText("21,4°C")).toBeInTheDocument();
    expect(screen.queryByText("48%")).toBeNull();
  });

  it("renders nothing when no metric is visible", () => {
    const { container } = render(<RoomMetricCard room={{ ...room, metrics: [
      { kind: "temperature", value: 21.4, unit: "°C", visible: false },
    ] }} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("shows an em dash when the value is null", () => {
    render(<RoomMetricCard room={{ key: "zolder", name: "Zolder", metrics: [
      { kind: "temperature", value: null, unit: "°C", visible: true },
    ] }} />);
    expect(screen.getByText("—")).toBeInTheDocument();
  });
});
```

- [ ] **Step 6: Run and watch it fail**

Run: `npx vitest run app/components/RoomMetricCard.test.tsx`
Expected: FAIL — component does not exist.

- [ ] **Step 7: Implement `app/components/RoomMetricCard.tsx`**

```tsx
"use client";
import { Thermometer, Droplets } from "lucide-react";
import type { RoomMetrics } from "@/lib/types";
import { Card } from "@/app/components/ui/card";
import { useT } from "@/app/components/LanguageProvider";
import { formatMetricValue, METRIC_LABEL_KEY } from "@/lib/metrics";

export function RoomMetricCard({ room }: { room: RoomMetrics }) {
  const t = useT();
  const visible = room.metrics.filter((m) => m.visible);
  if (visible.length === 0) return null;

  return (
    <Card aria-label={room.name}>
      <h2 className="text-lg font-semibold tracking-tight">{room.name}</h2>
      <div className="mt-3 flex flex-wrap gap-x-7 gap-y-3">
        {visible.map((m) => (
          <div key={m.kind} className="flex items-center gap-2.5">
            {m.kind === "temperature" ? (
              <Thermometer size={20} className="text-[var(--accent-heat)]" aria-hidden />
            ) : (
              <Droplets size={20} className="text-[var(--ring)]" aria-hidden />
            )}
            <div>
              <p className="font-display text-2xl font-semibold leading-none tabular-nums">{formatMetricValue(m)}</p>
              <p className="mt-1 text-xs text-[var(--muted)]">{t(METRIC_LABEL_KEY[m.kind])}</p>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}
```

- [ ] **Step 8: Run to verify pass**

Run: `npx vitest run app/components/RoomMetricCard.test.tsx lib/metrics.test.ts`
Expected: PASS.

- [ ] **Step 9: Checkpoint**

Run: `npm test`
Expected: all green.

---

### Task 8: Render metric cards on the home screen

**Files:**
- Modify: `app/page.tsx`

**Interfaces:**
- Consumes: `state.metrics: RoomMetrics[]` (Task 4); `RoomMetricCard` (Task 7).
- Produces: home screen shows one `RoomMetricCard` per room in the masonry grid after the chills.

- [ ] **Step 1: Import and render in the grid**

In `app/page.tsx`, add the import next to the other component imports:

```ts
import { RoomMetricCard } from "@/app/components/RoomMetricCard";
```

Inside the masonry `<div className="columns-1 gap-4 md:columns-2 xl:columns-3">`, after the `state.chills.map(...)` block and before the closing `</div>`, add:

```tsx
          {state.metrics.map((room, i) => (
            <div
              key={room.key}
              className="animate-rise mb-4 break-inside-avoid"
              style={{ animationDelay: `${180 + (state.chills.length + i) * 60}ms` }}
            >
              <RoomMetricCard room={room} />
            </div>
          ))}
```

(A `RoomMetricCard` whose metrics are all hidden returns `null`; the wrapper div then renders empty and collapses — no visible artifact.)

- [ ] **Step 2: Checkpoint — lint, types, build**

Run: `npx eslint app/page.tsx app/components/RoomMetricCard.tsx && npx tsc --noEmit -p tsconfig.json && npm run build`
Expected: lint clean, types clean, build succeeds.

---

### Task 9: Settings — "Widgets" card with per-metric toggles

**Files:**
- Modify: `app/settings/page.tsx`
- Test: `app/settings/page.test.tsx`

**Interfaces:**
- Consumes: `state.metrics` from `/api/state` (Task 4); `RoomMetrics`, `MetricKind` (Task 1); metric i18n keys (Task 6); `formatMetricValue`, `METRIC_LABEL_KEY` (Task 7); `PUT /api/settings { hiddenMetrics }` (Task 3).
- Produces: a `WidgetsCard` rendered on the settings page; toggling a metric persists the full `hiddenMetrics` deny-list (debounced).

- [ ] **Step 1: Extend the test fixture + add failing tests**

In `app/settings/page.test.tsx`, add a `metrics` fixture next to `rooms`:

```ts
const metrics = [
  { key: "woonkamer", name: "Woonkamer", metrics: [
    { kind: "temperature", value: 21.4, unit: "°C", visible: true },
    { kind: "humidity", value: 48, unit: "%", visible: true },
  ] },
];
```

Update `fetchImpl` so `/api/state` returns the metrics too:

```ts
function fetchImpl(url: string) {
  if (url === "/api/state") {
    return Promise.resolve({ ok: true, json: () => Promise.resolve({ rooms, metrics }) });
  }
  return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
}
```

Append two tests (English provider → labels are "Temperature"/"Humidity"):

```ts
  it("renders the Widgets section with a switch per metric", async () => {
    render(wrap(<SettingsPage />));
    expect(await screen.findByText("Widgets")).toBeInTheDocument();
    expect(await screen.findByRole("switch", { name: "Woonkamer Temperature" })).toBeInTheDocument();
    expect(screen.getByRole("switch", { name: "Woonkamer Humidity" })).toBeInTheDocument();
  });

  it("toggling a metric off PUTs the hiddenMetrics deny-list", async () => {
    render(wrap(<SettingsPage />));
    const sw = await screen.findByRole("switch", { name: "Woonkamer Humidity" });
    fireEvent.click(sw);
    await waitFor(() => {
      const call = fetchMock.mock.calls.find(
        (c) => c[0] === "/api/settings" && c[1]?.method === "PUT" && JSON.parse(c[1].body).hiddenMetrics,
      );
      expect(call).toBeTruthy();
      expect(JSON.parse(call![1].body).hiddenMetrics.woonkamer).toEqual(["humidity"]);
    });
  });
```

- [ ] **Step 2: Run and watch it fail**

Run: `npx vitest run app/settings/page.test.tsx`
Expected: FAIL — no "Widgets" text / no metric switches.

- [ ] **Step 3: Add the `WidgetsCard` component**

In `app/settings/page.tsx`, extend the imports:

```ts
import { ArrowLeft, ChevronDown, Star, Loader2, Thermometer, Droplets } from "lucide-react";
import type { Language, Theme, RoomState, RoomMetrics, MetricKind } from "@/lib/types";
import { formatMetricValue, METRIC_LABEL_KEY } from "@/lib/metrics";
```

(Replace the existing `lucide-react` and `@/lib/types` import lines accordingly; keep the other imports.)

Add this component above `export default function SettingsPage()`:

```tsx
/** Toggle which per-room metric widgets show on the home screen (deny-list). */
function WidgetsCard({ metrics }: { metrics: RoomMetrics[] | null }) {
  const t = useT();
  const [hidden, setHidden] = useState<Record<string, Set<MetricKind>>>({});
  const [saving, setSaving] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pending = useRef<Record<string, string[]> | null>(null);
  const mounted = useRef(true);

  // Seed local hidden-state from the server-computed visible flags.
  useEffect(() => {
    if (!metrics) return;
    const h: Record<string, Set<MetricKind>> = {};
    for (const room of metrics) {
      const off = room.metrics.filter((m) => !m.visible).map((m) => m.kind);
      if (off.length) h[room.key] = new Set(off);
    }
    setHidden(h);
  }, [metrics]);

  const flush = useCallback(() => {
    const hiddenMetrics = pending.current;
    if (!hiddenMetrics) return;
    pending.current = null;
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    fetch("/api/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ hiddenMetrics }),
      keepalive: true,
    })
      .then((r) => {
        if (!mounted.current) return;
        setSaving(false);
        if (r.ok) toast.success(t("settings.saved"));
        else toast.error(t("settings.saveError"));
      })
      .catch(() => {
        if (!mounted.current) return;
        setSaving(false);
        toast.error(t("settings.saveError"));
      });
  }, [t]);

  useEffect(
    () => () => {
      mounted.current = false;
      flush();
    },
    [flush],
  );

  function queue(next: Record<string, Set<MetricKind>>) {
    const hiddenMetrics: Record<string, string[]> = {};
    for (const [key, set] of Object.entries(next)) if (set.size) hiddenMetrics[key] = [...set];
    pending.current = hiddenMetrics;
    setSaving(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => flush(), 400);
  }

  function toggle(roomKey: string, kind: MetricKind) {
    setHidden((prev) => {
      const set = new Set(prev[roomKey]);
      if (set.has(kind)) set.delete(kind);
      else set.add(kind);
      const next = { ...prev, [roomKey]: set };
      queue(next);
      return next;
    });
  }

  return (
    <Card aria-label={t("settings.widgets")}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">{t("settings.widgets")}</h2>
          <p className="mt-1 text-sm text-[var(--muted)]">{t("settings.widgetsHint")}</p>
        </div>
        <div className="mt-1 shrink-0 text-xs text-[var(--muted)]" aria-live="polite">
          {saving && (
            <span className="flex items-center gap-1">
              <Loader2 size={11} className="animate-spin" aria-hidden /> {t("climate.saving")}
            </span>
          )}
        </div>
      </div>

      {metrics === null ? (
        <div className="flex justify-center py-8" role="status" aria-label={t("app.loading")}>
          <Loader2 className="animate-spin text-[var(--muted)]" aria-hidden />
        </div>
      ) : metrics.length === 0 ? (
        <p className="py-4 text-sm text-[var(--muted)]">{t("lights.noRooms")}</p>
      ) : (
        <div className="mt-3 divide-y divide-[var(--card-border)]">
          {metrics.map((room) => (
            <div key={room.key} className="py-3">
              <p className="mb-2 font-medium">{room.name}</p>
              <ul className="flex flex-col gap-2.5">
                {room.metrics.map((m) => {
                  const on = !hidden[room.key]?.has(m.kind);
                  const label = t(METRIC_LABEL_KEY[m.kind]);
                  return (
                    <li key={m.kind} className="flex items-center justify-between gap-3">
                      <span className="flex items-center gap-2 text-sm">
                        {m.kind === "temperature" ? (
                          <Thermometer size={16} className="text-[var(--muted)]" aria-hidden />
                        ) : (
                          <Droplets size={16} className="text-[var(--muted)]" aria-hidden />
                        )}
                        {label}
                        <span className="tabular-nums text-[var(--muted)]">{formatMetricValue(m)}</span>
                      </span>
                      <Switch
                        checked={on}
                        onCheckedChange={() => toggle(room.key, m.kind)}
                        aria-label={`${room.name} ${label}`}
                      />
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
```

- [ ] **Step 4: Capture metrics in the page and render the card**

In `SettingsPage`, add a metrics state next to `rooms`:

```ts
  const [metrics, setMetrics] = useState<RoomMetrics[] | null>(null);
```

In the existing `/api/state` `.then` callback, set it from the payload (alongside `setRooms`):

```ts
      .then((s: { rooms?: RoomState[]; metrics?: RoomMetrics[] }) => {
        if (!alive) return;
        const rs = s.rooms ?? [];
        setRooms(rs);
        setMetrics(s.metrics ?? []);
        setFavSets(Object.fromEntries(rs.map((r) => [r.key, new Set(r.favorites)])));
        setOpenRoom(rs[0]?.key ?? null);
      })
```

(Keep the existing `.catch(() => alive && setRooms([]))`; add `setMetrics([])` there too: `.catch(() => { if (alive) { setRooms([]); setMetrics([]); } })`.)

Render `<WidgetsCard metrics={metrics} />` in the JSX immediately after `<NotificationsCard />`:

```tsx
      <NotificationsCard />

      <WidgetsCard metrics={metrics} />
```

- [ ] **Step 5: Run to verify pass**

Run: `npx vitest run app/settings/page.test.tsx`
Expected: PASS (the 400 ms debounce fires well within `waitFor`'s default 1000 ms timeout).

- [ ] **Step 6: Checkpoint**

Run: `npm test`
Expected: all green.

---

### Task 10: Final verification

**Files:** none (verification only).

- [ ] **Step 1: Full suite**

Run: `npm test`
Expected: all tests pass (190 existing + the new ones).

- [ ] **Step 2: Lint the touched files**

Run: `npx eslint lib/metrics.ts lib/state-mapper.ts lib/settings-store.ts config/devices.ts app/page.tsx app/settings/page.tsx app/components/RoomMetricCard.tsx app/api/state/route.ts app/api/settings/route.ts`
Expected: clean.

- [ ] **Step 3: Production build**

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 4: Manual smoke (optional, needs HA)**

Run: `npm run dev`, open the app. Expect room metric cards (Woonkamer, Slaapkamers, Zolder, Speelkamer, Kamer Bas, Buiten) in the grid with live temp/humidity. In Settings → Widgets, toggle one off and confirm it disappears from the home screen on the next poll (~3 s).

---

## Self-Review

**Spec coverage:**
- Curated config `ROOM_METRICS` → Task 1. ✓
- Data model (`MetricValue`/`RoomMetrics`/`AppState.metrics`/`AppSettings.hiddenMetrics`) → Task 1. ✓
- `state-mapper.mapMetrics` + threaded `hiddenMetrics` → Task 4. ✓
- `/api/state` passes `hiddenMetrics` (one settings read) → Task 5. ✓
- Settings persistence (defaults/sanitize/merge, deny-list) → Task 2. ✓
- Settings API schema → Task 3. ✓
- Home UI one card per room in masonry → Tasks 7 + 8. ✓
- Settings "Widgets" card with per-metric toggles, debounced save → Task 9. ✓
- i18n keys → Task 6. ✓
- Edge cases: null/unavailable → `—` (Tasks 4, 7); all hidden → no card (Task 7); stale keys dropped (Task 2); deny-list "new sensor visible by default" (Task 4 semantics). ✓
- Tests for config, state-mapper, settings-store, settings route, component, settings page → Tasks 1–9. ✓
- "Keep both duplicates" — no de-dup logic added; both ship visible. ✓

**Placeholder scan:** none — every step has concrete code/commands.

**Type consistency:** `mapHaStatesToAppState` 5th param `hiddenMetrics` matches Task 5's call site (`settings.hiddenMetrics`). `formatMetricValue`/`METRIC_LABEL_KEY` defined in Task 7, consumed in Tasks 7 + 9. `RoomMetrics`/`MetricKind`/`MetricValue` defined in Task 1, used consistently throughout. Settings deny-list shape `Record<string,string[]>` consistent across types, store, schema, mapper, and UI.
