# Zonnepanelen-widget Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Toon SolarEdge + slimme-meter data uit Home Assistant als een herordenbare kaart op het home-scherm: groot live-vermogen, een dagcurve, een Vandaag/Week/Maand/Jaar-schakelaar, en drie stats.

**Architecture:** Volgt het bestaande patroon config → types → mapper → API → component. Live waarden (hero, net-flow, dekking) liften mee op de bestaande 3s `/api/state`-poll via een nieuwe `mapSolar`. De grafiek + periode-totaal komen los uit een nieuwe `/api/solar-history`-route die HA's eigen geschiedenis-API (REST) leest en pure transformaties in `lib/solar-history.ts` toepast (downsample voor de power-curve; cumulatieve lifetime-delta's voor kWh-staven).

**Tech Stack:** Next.js 16.2.9 (App Router, Route Handlers), React 19, TypeScript, Recharts 3.9, lucide-react, Tailwind v4, Vitest + @testing-library/react.

## Global Constraints

> Elke task erft deze regels impliciet.

- **Niet-standaard Next.js:** AGENTS.md eist — lees de relevante gids in `node_modules/next/dist/docs/` vóór het schrijven van route/component-code. Route-handler signatuur in deze versie: `export async function GET(req: Request): Promise<Response>`; query via `new URL(req.url).searchParams`; zet `export const dynamic = "force-dynamic"`. Geen `context`/`params` (geen dynamische segmenten).
- **HA-client is REST-only.** Gebruik `baseUrl()` + `authHeader()` uit `lib/ha-client.ts`; geen WebSocket.
- **Geen nieuwe dependencies.** Recharts en lucide-react zijn al aanwezig.
- **Getalnotatie nl-NL:** komma als decimaalteken; `—` (em-dash) voor `null`. Spiegel `formatMetricValue` in `lib/metrics.ts`.
- **i18n verplicht in twee talen:** elke nieuwe UI-string krijgt een sleutel in zowel de `en`-const (bron van `MsgKey`) als de `nl`-record in `lib/i18n.ts`. Lees strings via `const t = useT()` uit `@/app/components/LanguageProvider`.
- **Tests:** Vitest, co-located `*.test.ts(x)`. Component-tests wrappen met `LanguageProvider initial="nl"` (de `NL`-wrapper) en mocken `fetch` via `vi.stubGlobal`. Absolute imports (`@/lib/...`, `@/app/...`).
- **Dit is GEEN git-repo.** Vervang elke "Commit"-stap door de volledige verificatie: `npm test && npx tsc --noEmit && npm run lint`. Wordt git later geïnitialiseerd, commit dan per task.
- **Solar-entities (geverifieerd tegen de live HA):** `sensor.solaredge_current_power` (W), `sensor.solaredge_lifetime_energy` (Wh), `sensor.home_solar_percentage` (%), `sensor.electricity_meter_power_consumption` (kW, afname), `sensor.electricity_meter_power_production` (kW, teruglevering).

---

### Task 1: Live solar-staat — config, types, mapper

**Files:**
- Modify: `config/devices.ts` (voeg `SOLAR` toe, na `ROOM_METRICS`/`METRIC_ROOM_KEYS`)
- Modify: `lib/types.ts` (voeg solar-types toe; `solar` aan `AppState`)
- Modify: `lib/state-mapper.ts` (`mapSolar` + opnemen in `mapHaStatesToAppState`)
- Test: `lib/state-mapper.test.ts` (bestaand — voeg cases toe)

**Interfaces:**
- Produces:
  - `config/devices.ts` → `export const SOLAR` (object met keys `currentPower`, `lifetimeEnergy`, `coverage`, `gridConsumption`, `gridProduction`).
  - `lib/types.ts` → `GridDirection = "import" | "export" | "idle"`, `SolarState`, `SolarRange = "today" | "week" | "month" | "year"`, `SolarHistoryPoint = { t: number; value: number | null }`, `SolarHistoryResponse`. `AppState` krijgt `solar: SolarState`.
  - `mapHaStatesToAppState(states, ...)` retourneert nu ook `solar`.
- Consumes: `numericState` (al geïmporteerd in state-mapper vanuit `@/lib/metrics`).

- [ ] **Step 1: Schrijf de falende test**

Voeg toe aan `lib/state-mapper.test.ts` (binnen het bestaande bestand; importeer `HaEntityState` als dat er nog niet is):

```typescript
describe("mapSolar (via mapHaStatesToAppState)", () => {
  it("maps live solar values and computes net export", () => {
    const states: HaEntityState[] = [
      { entity_id: "sensor.solaredge_current_power", state: "3240", attributes: {} },
      { entity_id: "sensor.solaredge_lifetime_energy", state: "16185908", attributes: {} },
      { entity_id: "sensor.home_solar_percentage", state: "100", attributes: {} },
      { entity_id: "sensor.electricity_meter_power_consumption", state: "0.2", attributes: {} },
      { entity_id: "sensor.electricity_meter_power_production", state: "2.0", attributes: {} },
    ];
    const app = mapHaStatesToAppState(states);
    expect(app.solar.available).toBe(true);
    expect(app.solar.currentPowerW).toBe(3240);
    expect(app.solar.lifetimeKwh).toBe(16186);
    expect(app.solar.coveragePct).toBe(100);
    expect(app.solar.netGridKw).toBeCloseTo(-1.8, 5);
    expect(app.solar.gridDirection).toBe("export");
  });

  it("is unavailable and idle when solar sensors are missing", () => {
    const app = mapHaStatesToAppState([]);
    expect(app.solar.available).toBe(false);
    expect(app.solar.currentPowerW).toBeNull();
    expect(app.solar.netGridKw).toBeNull();
    expect(app.solar.gridDirection).toBe("idle");
  });
});
```

- [ ] **Step 2: Run test → verwacht FAIL**

Run: `npm test -- lib/state-mapper.test.ts`
Expected: FAIL — `app.solar` is `undefined` / type-fout `Property 'solar' is missing`.

- [ ] **Step 3: Voeg de types toe**

In `lib/types.ts`, voeg vóór `AppState` toe:

```typescript
export type GridDirection = "import" | "export" | "idle";

export interface SolarState {
  available: boolean;
  currentPowerW: number | null;   // sensor.solaredge_current_power (W)
  netGridKw: number | null;       // consumption - production (kW); + = afname, - = teruglevering
  gridDirection: GridDirection;
  coveragePct: number | null;     // sensor.home_solar_percentage (%)
  lifetimeKwh: number | null;     // sensor.solaredge_lifetime_energy / 1000 (kWh)
}

export type SolarRange = "today" | "week" | "month" | "year";
export interface SolarHistoryPoint {
  t: number;            // epoch ms
  value: number | null; // W (power) of kWh (energy); null = geen data in bucket
}
export interface SolarHistoryResponse {
  range: SolarRange;
  chartType: "power" | "energy";
  unit: "W" | "kWh";
  points: SolarHistoryPoint[];
  summary: { producedKwh: number | null };
}
```

En breid `AppState` uit:

```typescript
export interface AppState {
  chills: ChillState[];
  thermostat: ThermostatState | null;
  rooms: RoomState[];
  metrics: RoomMetrics[];
  solar: SolarState;
}
```

- [ ] **Step 4: Voeg de SOLAR-config toe**

In `config/devices.ts`, onderaan toevoegen:

```typescript
/** Vaste zonnepaneel-/energie-entities (SolarEdge + P1 slimme meter). */
export const SOLAR = {
  currentPower: "sensor.solaredge_current_power",
  lifetimeEnergy: "sensor.solaredge_lifetime_energy",
  coverage: "sensor.home_solar_percentage",
  gridConsumption: "sensor.electricity_meter_power_consumption",
  gridProduction: "sensor.electricity_meter_power_production",
} as const;
```

- [ ] **Step 5: Implementeer `mapSolar` en neem op in de mapper**

In `lib/state-mapper.ts`: voeg `SOLAR` toe aan de bestaande import uit `@/config/devices`, importeer `SolarState`, `GridDirection` uit `@/lib/types`, en voeg de mapper toe:

```typescript
function mapSolar(byId: Map<string, HaEntityState>): SolarState {
  const power = numericState(byId.get(SOLAR.currentPower));         // W
  const lifetimeWh = numericState(byId.get(SOLAR.lifetimeEnergy));  // Wh
  const coverage = numericState(byId.get(SOLAR.coverage));          // %
  const consumption = numericState(byId.get(SOLAR.gridConsumption)); // kW (afname)
  const production = numericState(byId.get(SOLAR.gridProduction));   // kW (teruglevering)

  const net =
    consumption != null && production != null
      ? Math.round((consumption - production) * 100) / 100
      : null;
  const direction: GridDirection =
    net == null ? "idle" : net > 0.01 ? "import" : net < -0.01 ? "export" : "idle";

  return {
    available: power != null || lifetimeWh != null,
    currentPowerW: power,
    netGridKw: net,
    gridDirection: direction,
    coveragePct: coverage,
    lifetimeKwh: lifetimeWh != null ? Math.round(lifetimeWh / 1000) : null,
  };
}
```

Voeg in `mapHaStatesToAppState` aan het geretourneerde object toe:

```typescript
    metrics: mapMetrics(byId, hiddenMetrics),
    solar: mapSolar(byId),
```

- [ ] **Step 6: Run test → verwacht PASS**

Run: `npm test -- lib/state-mapper.test.ts`
Expected: PASS (beide nieuwe cases groen).

- [ ] **Step 7: Repareer AppState-fixtures en verifieer types**

Run: `npx tsc --noEmit`
Voor elke fout "Property 'solar' is missing in type ... AppState" (test-fixtures of components die een `AppState`-literal bouwen), voeg dit veld toe:

```typescript
solar: { available: false, currentPowerW: null, netGridKw: null, gridDirection: "idle", coveragePct: null, lifetimeKwh: null },
```

Herhaal tot `npx tsc --noEmit` schoon is.

- [ ] **Step 8: Verify & checkpoint**

Run: `npm test && npx tsc --noEmit && npm run lint`
Expected: alles groen. (Geen git → geen commit.)

---

### Task 2: HA history-client (`getHistory`)

**Files:**
- Modify: `lib/ha-client.ts` (voeg `HaHistoryState` + `getHistory` toe)
- Test: `lib/ha-client.test.ts` (maak aan als hij niet bestaat)

**Interfaces:**
- Produces: `export interface HaHistoryState { state: string; last_changed: string }`; `export async function getHistory(entityId: string, startISO: string, endISO: string): Promise<HaHistoryState[]>`.
- Consumes: bestaande `baseUrl()`, `authHeader()`, `HaError` (zelfde module).

- [ ] **Step 1: Schrijf de falende test**

Maak `lib/ha-client.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { getHistory } from "@/lib/ha-client";

beforeEach(() => {
  vi.stubEnv("HA_URL", "http://ha.test");
  vi.stubEnv("HA_TOKEN", "tok");
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe("getHistory", () => {
  it("requests the HA history period endpoint and normalises the first series", async () => {
    const fetchMock = vi.fn(() => Promise.resolve({
      ok: true,
      json: () => Promise.resolve([[
        { entity_id: "sensor.x", state: "10", last_changed: "2026-06-25T08:00:00+00:00" },
        { state: "20", last_changed: "2026-06-25T09:00:00+00:00" },
      ]]),
    }));
    vi.stubGlobal("fetch", fetchMock);

    const out = await getHistory("sensor.x", "2026-06-25T00:00:00.000Z", "2026-06-25T10:00:00.000Z");

    const url = String(fetchMock.mock.calls[0][0]);
    expect(url).toContain("http://ha.test/api/history/period/");
    expect(url).toContain("filter_entity_id=sensor.x");
    expect(url).toContain("minimal_response");
    expect(out).toEqual([
      { state: "10", last_changed: "2026-06-25T08:00:00+00:00" },
      { state: "20", last_changed: "2026-06-25T09:00:00+00:00" },
    ]);
  });

  it("returns [] when HA returns an empty body", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve([]) })));
    expect(await getHistory("sensor.x", "a", "b")).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test → verwacht FAIL**

Run: `npm test -- lib/ha-client.test.ts`
Expected: FAIL — `getHistory` bestaat niet.

- [ ] **Step 3: Implementeer `getHistory`**

Lees eerst, per Global Constraints, de relevante HA-conventie niet nodig (dit is geen Next-route maar een fetch-helper). Voeg toe aan `lib/ha-client.ts`:

```typescript
export interface HaHistoryState {
  state: string;
  last_changed: string;
}

/**
 * Lees HA's eigen geschiedenis voor één entity over [startISO, endISO].
 * Gebruikt minimal_response/no_attributes/significant_changes_only om de payload
 * klein te houden. Retourneert de (chronologische) statuslijst, of [] bij leeg.
 */
export async function getHistory(
  entityId: string,
  startISO: string,
  endISO: string,
): Promise<HaHistoryState[]> {
  const qs =
    `filter_entity_id=${encodeURIComponent(entityId)}` +
    `&end_time=${encodeURIComponent(endISO)}` +
    `&minimal_response&no_attributes&significant_changes_only`;
  const res = await fetch(`${baseUrl()}/api/history/period/${encodeURIComponent(startISO)}?${qs}`, {
    headers: { Authorization: authHeader() },
    cache: "no-store",
  });
  if (!res.ok) throw new HaError(`HA history failed: ${res.status}`, res.status);
  const data = (await res.json()) as Array<Array<{ state: string; last_changed: string }>>;
  return (data[0] ?? []).map((s) => ({ state: s.state, last_changed: s.last_changed }));
}
```

- [ ] **Step 4: Run test → verwacht PASS**

Run: `npm test -- lib/ha-client.test.ts`
Expected: PASS.

- [ ] **Step 5: Verify & checkpoint**

Run: `npm test && npx tsc --noEmit && npm run lint`
Expected: alles groen.

---

### Task 3: Pure history-transformaties (`lib/solar-history.ts`)

Kern van de feature — grondig testen.

**Files:**
- Create: `lib/solar-history.ts`
- Test: `lib/solar-history.test.ts`

**Interfaces:**
- Consumes: `HaHistoryState` (Task 2), `SolarHistoryPoint` (Task 1).
- Produces:
  - `parseHistory(states: { state: string; last_changed: string }[]): RawPoint[]` met `interface RawPoint { t: number; v: number }`
  - `downsamplePower(points: RawPoint[], fromMs: number, toMs: number, maxPoints: number): SolarHistoryPoint[]`
  - `energyBuckets(points: RawPoint[], boundaries: number[]): SolarHistoryPoint[]`
  - `sumKwh(points: SolarHistoryPoint[]): number | null`
  - `dayBoundaries(now: number, days: number): number[]`
  - `monthBoundaries(now: number, months: number): number[]`

- [ ] **Step 1: Schrijf de falende test**

Maak `lib/solar-history.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import {
  parseHistory, downsamplePower, energyBuckets, sumKwh, dayBoundaries, monthBoundaries,
} from "@/lib/solar-history";

const DAY = 86400000;

describe("parseHistory", () => {
  it("parses numeric states to sorted {t,v} and drops non-numeric", () => {
    const out = parseHistory([
      { state: "100", last_changed: "2026-06-25T09:00:00Z" },
      { state: "unavailable", last_changed: "2026-06-25T09:30:00Z" },
      { state: "200", last_changed: "2026-06-25T10:00:00Z" },
    ]);
    expect(out).toEqual([
      { t: Date.parse("2026-06-25T09:00:00Z"), v: 100 },
      { t: Date.parse("2026-06-25T10:00:00Z"), v: 200 },
    ]);
  });
});

describe("downsamplePower", () => {
  it("returns points unchanged when within maxPoints", () => {
    const pts = [{ t: 10, v: 1 }, { t: 20, v: 2 }];
    expect(downsamplePower(pts, 0, 30, 48)).toEqual([
      { t: 10, value: 1 }, { t: 20, value: 2 },
    ]);
  });
  it("buckets and averages when above maxPoints", () => {
    const pts = [{ t: 0, v: 0 }, { t: 1, v: 10 }, { t: 9, v: 20 }, { t: 10, v: 30 }];
    const out = downsamplePower(pts, 0, 10, 2);
    expect(out).toHaveLength(2);
    expect(out[0].value).toBe(5);   // avg(0,10)
    expect(out[1].value).toBe(25);  // avg(20,30)
  });
});

describe("energyBuckets", () => {
  it("computes per-bucket kWh as lifetime delta (Wh→kWh)", () => {
    const pts = [
      { t: 0 * DAY, v: 1000 },
      { t: 1 * DAY, v: 4000 },   // +3000 Wh = 3 kWh
      { t: 2 * DAY, v: 9000 },   // +5000 Wh = 5 kWh
    ];
    const out = energyBuckets(pts, [0 * DAY, 1 * DAY, 2 * DAY]);
    expect(out).toEqual([
      { t: 0, value: 3 },
      { t: 1 * DAY, value: 5 },
    ]);
  });
  it("clamps a negative delta (counter reset) to 0", () => {
    const pts = [{ t: 0, v: 9000 }, { t: DAY, v: 1000 }];
    expect(energyBuckets(pts, [0, DAY])[0].value).toBe(0);
  });
  it("yields null for a bucket without readings", () => {
    expect(energyBuckets([], [0, DAY])[0].value).toBeNull();
  });
});

describe("sumKwh", () => {
  it("sums non-null values, null when all empty", () => {
    expect(sumKwh([{ t: 0, value: 3 }, { t: 1, value: null }, { t: 2, value: 5 }])).toBe(8);
    expect(sumKwh([{ t: 0, value: null }])).toBeNull();
  });
});

describe("boundaries", () => {
  it("dayBoundaries(now,1) is [startOfDayUTC, now]", () => {
    const now = Date.parse("2026-06-25T13:30:00Z");
    expect(dayBoundaries(now, 1)).toEqual([Date.parse("2026-06-25T00:00:00Z"), now]);
  });
  it("dayBoundaries(now,7) has 8 ascending edges ending at now", () => {
    const now = Date.parse("2026-06-25T13:30:00Z");
    const b = dayBoundaries(now, 7);
    expect(b).toHaveLength(8);
    expect(b[b.length - 1]).toBe(now);
    expect(b[0]).toBe(Date.parse("2026-06-19T00:00:00Z"));
  });
  it("monthBoundaries(now,12) starts 11 months back on the 1st", () => {
    const now = Date.parse("2026-06-25T13:30:00Z");
    const b = monthBoundaries(now, 12);
    expect(b).toHaveLength(13);
    expect(b[0]).toBe(Date.UTC(2025, 6, 1)); // jul 2025
    expect(b[b.length - 1]).toBe(now);
  });
});
```

- [ ] **Step 2: Run test → verwacht FAIL**

Run: `npm test -- lib/solar-history.test.ts`
Expected: FAIL — module bestaat niet.

- [ ] **Step 3: Implementeer `lib/solar-history.ts`**

```typescript
import type { SolarHistoryPoint } from "@/lib/types";

export interface RawPoint {
  t: number;
  v: number;
}

const DAY_MS = 86_400_000;

/** HA minimal-history states → numerieke, chronologisch gesorteerde punten. */
export function parseHistory(states: { state: string; last_changed: string }[]): RawPoint[] {
  const out: RawPoint[] = [];
  for (const s of states) {
    const t = Date.parse(s.last_changed);
    const v = Number(s.state);
    if (!Number.isNaN(t) && !Number.isNaN(v)) out.push({ t, v });
  }
  return out.sort((a, b) => a.t - b.t);
}

/** Window [fromMs,toMs] en downsample tot <= maxPoints tijd-gemiddelde buckets. */
export function downsamplePower(
  points: RawPoint[],
  fromMs: number,
  toMs: number,
  maxPoints: number,
): SolarHistoryPoint[] {
  const windowed = points.filter((p) => p.t >= fromMs && p.t <= toMs);
  if (windowed.length <= maxPoints) return windowed.map((p) => ({ t: p.t, value: p.v }));

  const span = toMs - fromMs || 1;
  const buckets = Array.from({ length: maxPoints }, () => ({ sum: 0, count: 0 }));
  for (const p of windowed) {
    let idx = Math.floor(((p.t - fromMs) / span) * maxPoints);
    if (idx < 0) idx = 0;
    if (idx >= maxPoints) idx = maxPoints - 1;
    buckets[idx].sum += p.v;
    buckets[idx].count += 1;
  }
  return buckets.map((b, i) => ({
    t: Math.round(fromMs + ((i + 0.5) / maxPoints) * span),
    value: b.count > 0 ? Math.round(b.sum / b.count) : null,
  }));
}

/** Laatste cumulatieve waarde op of vóór `boundary` (punten zijn gesorteerd). */
function lifetimeAt(points: RawPoint[], boundary: number): number | null {
  let val: number | null = null;
  for (const p of points) {
    if (p.t <= boundary) val = p.v;
    else break;
  }
  return val;
}

/**
 * Per-bucket kWh = delta van de cumulatieve lifetime-Wh tussen opeenvolgende
 * grenzen, geclampt op >= 0 (tellerreset), Wh→kWh. Punt-timestamp = bucketstart.
 */
export function energyBuckets(points: RawPoint[], boundaries: number[]): SolarHistoryPoint[] {
  const out: SolarHistoryPoint[] = [];
  for (let i = 0; i < boundaries.length - 1; i++) {
    const start = lifetimeAt(points, boundaries[i]);
    const end = lifetimeAt(points, boundaries[i + 1]);
    let value: number | null = null;
    if (start != null && end != null) {
      value = Math.round((Math.max(0, end - start) / 1000) * 100) / 100;
    }
    out.push({ t: boundaries[i], value });
  }
  return out;
}

export function sumKwh(points: SolarHistoryPoint[]): number | null {
  const vals = points.map((p) => p.value).filter((v): v is number => v != null);
  if (vals.length === 0) return null;
  return Math.round(vals.reduce((a, b) => a + b, 0) * 100) / 100;
}

function utcStartOfDay(ms: number): number {
  const d = new Date(ms);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

/**
 * `days` dag-buckets: [start van (vandaag-(days-1)), …, start van vandaag, now].
 * UTC-dag-grenzen (deterministisch + testbaar); 's nachts is de productie ~0, dus
 * UTC vs lokale middernacht geeft praktisch identieke dagtotalen.
 */
export function dayBoundaries(now: number, days: number): number[] {
  const startToday = utcStartOfDay(now);
  const out: number[] = [];
  for (let i = days - 1; i >= 0; i--) out.push(startToday - i * DAY_MS);
  out.push(now);
  return out;
}

/** `months` maand-buckets: 1e van elke maand (UTC) terug, eindigend op now. */
export function monthBoundaries(now: number, months: number): number[] {
  const d = new Date(now);
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth();
  const out: number[] = [];
  for (let i = months - 1; i >= 0; i--) out.push(Date.UTC(y, m - i, 1));
  out.push(now);
  return out;
}
```

- [ ] **Step 4: Run test → verwacht PASS**

Run: `npm test -- lib/solar-history.test.ts`
Expected: PASS (alle cases groen).

- [ ] **Step 5: Verify & checkpoint**

Run: `npm test && npx tsc --noEmit && npm run lint`
Expected: alles groen.

---

### Task 4: API-route `/api/solar-history`

**Files:**
- Create: `app/api/solar-history/route.ts`
- Test: `app/api/solar-history/route.test.ts`

**Interfaces:**
- Consumes: `getHistory` (Task 2), `SOLAR` (Task 1), alle exports van `lib/solar-history` (Task 3), `statusForError` (bestaand in `ha-client`), `SolarRange`/`SolarHistoryResponse` (Task 1).
- Produces: `GET(req: Request): Promise<Response>` met JSON body = `SolarHistoryResponse`.

- [ ] **Step 1: Lees de Next.js route-conventie**

Per Global Constraints: open de Route-Handlers gids in `node_modules/next/dist/docs/` (zoek `route.md` onder `01-app/.../file-conventions/`) en bevestig de `GET(req: Request)`-signatuur en `export const dynamic`. Spiegel `app/api/history/route.ts`.

- [ ] **Step 2: Schrijf de falende test**

Maak `app/api/solar-history/route.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@/lib/ha-client", () => ({
  getHistory: vi.fn(),
  statusForError: () => 502,
}));
import { getHistory } from "@/lib/ha-client";
import { GET } from "@/app/api/solar-history/route";

const mockHistory = getHistory as unknown as ReturnType<typeof vi.fn>;

function req(range: string) {
  return new Request(`http://localhost/api/solar-history?range=${range}`);
}

beforeEach(() => mockHistory.mockReset());
afterEach(() => vi.restoreAllMocks());

describe("GET /api/solar-history", () => {
  it("rejects an unknown range with 400", async () => {
    const res = await GET(req("decade"));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "bad_request" });
  });

  it("returns a power curve + producedKwh for range=today", async () => {
    mockHistory
      .mockResolvedValueOnce([ // current_power
        { state: "1000", last_changed: "2026-06-25T09:00:00Z" },
        { state: "2000", last_changed: "2026-06-25T10:00:00Z" },
      ])
      .mockResolvedValueOnce([ // lifetime_energy
        { state: "1000", last_changed: "2026-06-25T00:00:00Z" },
        { state: "6000", last_changed: "2026-06-25T11:00:00Z" }, // +5000 Wh = 5 kWh
      ]);
    const res = await GET(req("today"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.range).toBe("today");
    expect(body.chartType).toBe("power");
    expect(body.unit).toBe("W");
    expect(Array.isArray(body.points)).toBe(true);
    expect(body.summary.producedKwh).toBe(5);
  });

  it("returns energy bars for range=week", async () => {
    mockHistory.mockResolvedValueOnce([
      { state: "0", last_changed: "2026-06-18T00:00:00Z" },
      { state: "7000", last_changed: "2026-06-25T00:00:00Z" }, // 7 kWh total over window
    ]);
    const res = await GET(req("week"));
    const body = await res.json();
    expect(body.chartType).toBe("energy");
    expect(body.unit).toBe("kWh");
    expect(Array.isArray(body.points)).toBe(true);
  });

  it("returns an empty payload (not a throw) when HA fails", async () => {
    mockHistory.mockRejectedValue(new Error("boom"));
    const res = await GET(req("today"));
    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.points).toEqual([]);
    expect(body.summary.producedKwh).toBeNull();
  });
});
```

- [ ] **Step 3: Run test → verwacht FAIL**

Run: `npm test -- app/api/solar-history/route.test.ts`
Expected: FAIL — route bestaat niet.

- [ ] **Step 4: Implementeer de route**

Maak `app/api/solar-history/route.ts`:

```typescript
import { getHistory, statusForError } from "@/lib/ha-client";
import { SOLAR } from "@/config/devices";
import {
  parseHistory, downsamplePower, energyBuckets, sumKwh, dayBoundaries, monthBoundaries,
} from "@/lib/solar-history";
import type { SolarRange, SolarHistoryResponse } from "@/lib/types";

export const dynamic = "force-dynamic";

const RANGES = ["today", "week", "month", "year"] as const;

function bucketsFor(range: Exclude<SolarRange, "today">, now: number): number[] {
  if (range === "week") return dayBoundaries(now, 7);
  if (range === "month") return dayBoundaries(now, 30);
  return monthBoundaries(now, 12); // year
}

export async function GET(req: Request): Promise<Response> {
  const range = new URL(req.url).searchParams.get("range") ?? "";
  if (!(RANGES as readonly string[]).includes(range)) {
    return Response.json({ error: "bad_request" }, { status: 400 });
  }
  const r = range as SolarRange;
  const now = Date.now();
  const iso = (ms: number) => new Date(ms).toISOString();

  try {
    if (r === "today") {
      const start = dayBoundaries(now, 1)[0];
      const [powerRaw, energyRaw] = await Promise.all([
        getHistory(SOLAR.currentPower, iso(start), iso(now)),
        getHistory(SOLAR.lifetimeEnergy, iso(start), iso(now)),
      ]);
      const points = downsamplePower(parseHistory(powerRaw), start, now, 48);
      const today = energyBuckets(parseHistory(energyRaw), [start, now]);
      const body: SolarHistoryResponse = {
        range: r, chartType: "power", unit: "W", points,
        summary: { producedKwh: today[0]?.value ?? null },
      };
      return Response.json(body);
    }

    const boundaries = bucketsFor(r, now);
    const raw = await getHistory(SOLAR.lifetimeEnergy, iso(boundaries[0]), iso(now));
    const points = energyBuckets(parseHistory(raw), boundaries);
    const body: SolarHistoryResponse = {
      range: r, chartType: "energy", unit: "kWh", points,
      summary: { producedKwh: sumKwh(points) },
    };
    return Response.json(body);
  } catch (e) {
    const empty: SolarHistoryResponse = {
      range: r,
      chartType: r === "today" ? "power" : "energy",
      unit: r === "today" ? "W" : "kWh",
      points: [],
      summary: { producedKwh: null },
    };
    return Response.json(empty, { status: statusForError(e) });
  }
}
```

- [ ] **Step 5: Run test → verwacht PASS**

Run: `npm test -- app/api/solar-history/route.test.ts`
Expected: PASS.

- [ ] **Step 6: Verify & checkpoint**

Run: `npm test && npx tsc --noEmit && npm run lint`
Expected: alles groen.

---

### Task 5: Weergave-formatters in `lib/metrics.ts`

**Files:**
- Modify: `lib/metrics.ts`
- Test: `lib/metrics.test.ts` (bestaand — voeg cases toe)

**Interfaces:**
- Produces: `wattsToKw(w: number | null): number | null`, `formatKw(kw: number | null): string`, `formatKwh(kwh: number | null): string`, `formatPercent(pct: number | null): string`.

- [ ] **Step 1: Schrijf de falende test**

Voeg toe aan `lib/metrics.test.ts`:

```typescript
import { wattsToKw, formatKw, formatKwh, formatPercent } from "@/lib/metrics";

describe("solar formatters", () => {
  it("wattsToKw converts and rounds to 2 decimals, null passes through", () => {
    expect(wattsToKw(3240)).toBe(3.24);
    expect(wattsToKw(null)).toBeNull();
  });
  it("formatKw uses a NL comma, em-dash for null", () => {
    expect(formatKw(3.24)).toBe("3,24");
    expect(formatKw(0)).toBe("0,00");
    expect(formatKw(null)).toBe("—");
  });
  it("formatKwh uses one decimal NL comma", () => {
    expect(formatKwh(18.4)).toBe("18,4");
    expect(formatKwh(null)).toBe("—");
  });
  it("formatPercent rounds, em-dash for null", () => {
    expect(formatPercent(99.6)).toBe("100");
    expect(formatPercent(null)).toBe("—");
  });
});
```

- [ ] **Step 2: Run test → verwacht FAIL**

Run: `npm test -- lib/metrics.test.ts`
Expected: FAIL — functies bestaan niet.

- [ ] **Step 3: Implementeer de formatters**

Voeg toe aan `lib/metrics.ts`:

```typescript
/** Watt → kW, op 2 decimalen; null blijft null. */
export function wattsToKw(w: number | null): number | null {
  return w == null ? null : Math.round((w / 1000) * 100) / 100;
}

/** kW-waarde als nl-NL string met 2 decimalen; "—" bij null. */
export function formatKw(kw: number | null): string {
  if (kw == null) return "—";
  return kw.toFixed(2).replace(".", ",");
}

/** kWh-waarde als nl-NL string met 1 decimaal; "—" bij null. */
export function formatKwh(kwh: number | null): string {
  if (kwh == null) return "—";
  return kwh.toFixed(1).replace(".", ",");
}

/** Procent afgerond als hele string; "—" bij null. */
export function formatPercent(pct: number | null): string {
  if (pct == null) return "—";
  return String(Math.round(pct));
}
```

- [ ] **Step 4: Run test → verwacht PASS**

Run: `npm test -- lib/metrics.test.ts`
Expected: PASS.

- [ ] **Step 5: Verify & checkpoint**

Run: `npm test && npx tsc --noEmit && npm run lint`
Expected: alles groen.

---

### Task 6: `SolarCard`-component + i18n-strings

**Files:**
- Create: `app/components/SolarCard.tsx`
- Modify: `lib/i18n.ts` (solar-strings in `en` én `nl`)
- Test: `app/components/SolarCard.test.tsx`

**Interfaces:**
- Consumes: `SolarState`, `SolarRange`, `SolarHistoryPoint`, `SolarHistoryResponse` (Task 1); `formatKw`, `formatKwh`, `formatPercent`, `wattsToKw` (Task 5); `Card`, `Menu`, `MenuItem`, `useT`, `MsgKey`.
- Produces: `export function SolarCard({ solar }: { solar: SolarState })`.

- [ ] **Step 1: Voeg i18n-strings toe**

In `lib/i18n.ts`, voeg deze sleutels toe aan de `en`-const:

```typescript
  "solar.title": "Solar",
  "solar.now": "Now",
  "solar.toGrid": "To grid",
  "solar.fromGrid": "From grid",
  "solar.coverage": "Coverage",
  "solar.empty": "No data yet",
  "solar.range.today": "Today",
  "solar.range.week": "Week",
  "solar.range.month": "Month",
  "solar.range.year": "Year",
  "widget.typeSolar": "Solar",
```

En dezelfde sleutels aan de `nl`-record:

```typescript
  "solar.title": "Zonnepanelen",
  "solar.now": "Nu",
  "solar.toGrid": "Naar net",
  "solar.fromGrid": "Van net",
  "solar.coverage": "Dekking",
  "solar.empty": "Nog geen data",
  "solar.range.today": "Vandaag",
  "solar.range.week": "Week",
  "solar.range.month": "Maand",
  "solar.range.year": "Jaar",
  "widget.typeSolar": "Zonnepanelen",
```

- [ ] **Step 2: Schrijf de falende test**

Maak `app/components/SolarCard.test.tsx`:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render as rtlRender, screen, waitFor } from "@testing-library/react";
import type { ReactElement, ReactNode } from "react";
import { SolarCard } from "@/app/components/SolarCard";
import { LanguageProvider } from "@/app/components/LanguageProvider";
import type { SolarState } from "@/lib/types";

function NL({ children }: { children: ReactNode }) {
  return <LanguageProvider initial="nl">{children}</LanguageProvider>;
}
const render = (ui: ReactElement) => rtlRender(ui, { wrapper: NL });

const solar: SolarState = {
  available: true, currentPowerW: 3240, netGridKw: -1.8,
  gridDirection: "export", coveragePct: 100, lifetimeKwh: 16186,
};

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  fetchMock = vi.fn(() => Promise.resolve({
    ok: true,
    json: () => Promise.resolve({
      range: "today", chartType: "power", unit: "W",
      points: [], summary: { producedKwh: 18.4 },
    }),
  }));
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

describe("SolarCard", () => {
  it("renders the live hero in kW with a NL comma", () => {
    render(<SolarCard solar={solar} />);
    expect(screen.getByText("3,24")).toBeInTheDocument();
  });

  it("labels the net stat as export (Naar net) with the absolute value", () => {
    render(<SolarCard solar={solar} />);
    expect(screen.getByText("Naar net")).toBeInTheDocument();
    expect(screen.getByText("1,80 kW")).toBeInTheDocument();
  });

  it("fetches today's history on mount and shows produced kWh", async () => {
    render(<SolarCard solar={solar} />);
    expect(fetchMock).toHaveBeenCalledWith("/api/solar-history?range=today");
    await waitFor(() => expect(screen.getByText("18,4 kWh")).toBeInTheDocument());
  });
});
```

- [ ] **Step 3: Run test → verwacht FAIL**

Run: `npm test -- app/components/SolarCard.test.tsx`
Expected: FAIL — component bestaat niet.

- [ ] **Step 4: Lees de Next/React-conventie en implementeer de component**

Per Global Constraints geen route hier, maar volg het bestaande client-component-patroon van `RoomMetricCard.tsx`. Maak `app/components/SolarCard.tsx`:

```typescript
"use client";
import { useEffect, useState } from "react";
import { Sun, ChevronDown } from "lucide-react";
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import type { SolarState, SolarRange, SolarHistoryPoint, SolarHistoryResponse } from "@/lib/types";
import type { MsgKey } from "@/lib/i18n";
import { Card } from "@/app/components/ui/card";
import { Menu, MenuItem } from "@/app/components/ui/menu";
import { useT } from "@/app/components/LanguageProvider";
import { formatKw, formatKwh, formatPercent, wattsToKw } from "@/lib/metrics";

const SOLAR_RANGES: SolarRange[] = ["today", "week", "month", "year"];
const RANGE_LABEL_KEY: Record<SolarRange, MsgKey> = {
  today: "solar.range.today",
  week: "solar.range.week",
  month: "solar.range.month",
  year: "solar.range.year",
};
const SOLAR_COLOR = "#f0913f";

type HistoryState = {
  chartType: "power" | "energy";
  points: SolarHistoryPoint[];
  producedKwh: number | null;
};
const EMPTY: HistoryState = { chartType: "power", points: [], producedKwh: null };

function RangeMenu({ range, onChange }: { range: SolarRange; onChange: (r: SolarRange) => void }) {
  const t = useT();
  return (
    <Menu
      label={t(RANGE_LABEL_KEY[range])}
      className="shrink-0"
      align="right"
      width="w-32"
      triggerClassName="flex items-center gap-1 rounded-full bg-foreground/[0.06] px-2.5 py-1 text-xs font-medium text-[var(--muted)] transition hover:bg-foreground/10 active:scale-95"
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

function Stat({ k, v, color }: { k: string; v: string; color?: string }) {
  return (
    <div className="min-w-0 flex-1 rounded-2xl bg-foreground/[0.035] px-2.5 py-2">
      <div className="truncate text-[0.66rem] uppercase tracking-wide text-[var(--muted)]">{k}</div>
      <div className="mt-0.5 truncate text-[0.95rem] font-bold" style={color ? { color } : undefined}>{v}</div>
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
        setHist({ chartType: d.chartType, points: d.points ?? [], producedKwh: d.summary?.producedKwh ?? null });
      })
      .catch(() => { if (alive) setHist(EMPTY); });
    return () => { alive = false; };
  }, [range]);

  const net = solar.netGridKw;
  const netLabel = solar.gridDirection === "export" ? t("solar.toGrid") : t("solar.fromGrid");
  const netColor = solar.gridDirection === "export" ? "var(--accent-cool)" : "var(--accent-warn)";
  const netValue = net == null ? "—" : `${formatKw(Math.abs(net))} kW`;
  const hasChart = hist.points.some((p) => p.value != null);

  return (
    <Card>
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2 text-[0.98rem] font-semibold">
          <span
            className="flex h-6 w-6 items-center justify-center rounded-full"
            style={{ background: "linear-gradient(135deg,#ffd66b,#f0913f)" }}
          >
            <Sun size={14} className="text-white" aria-hidden />
          </span>
          {t("solar.title")}
        </div>
        <RangeMenu range={range} onChange={setRange} />
      </div>

      <div className="font-display text-5xl font-medium leading-none tracking-tight">
        {formatKw(wattsToKw(solar.currentPowerW))}
        <span className="ml-1 text-base font-medium text-[var(--muted)]">kW</span>
      </div>

      <div className="mt-4 h-36">
        {!hasChart ? (
          <div className="flex h-full items-center justify-center text-xs text-[var(--muted)]">
            {t("solar.empty")}
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            {hist.chartType === "power" ? (
              <AreaChart data={hist.points} margin={{ top: 6, right: 8, bottom: 0, left: 0 }}>
                <defs>
                  <linearGradient id="solarFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0" stopColor={SOLAR_COLOR} stopOpacity={0.35} />
                    <stop offset="1" stopColor={SOLAR_COLOR} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="var(--card-border)" strokeDasharray="3 3" vertical={false} />
                <XAxis
                  dataKey="t" type="number" scale="time" domain={["dataMin", "dataMax"]}
                  tickFormatter={(v) => new Date(Number(v)).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  tick={{ fontSize: 10, fill: "var(--muted)" }} tickLine={false} axisLine={false} minTickGap={36}
                />
                <YAxis
                  width={40} tickCount={4}
                  tickFormatter={(v) => (Number(v) / 1000).toFixed(1).replace(".", ",")}
                  tick={{ fontSize: 10, fill: "var(--muted)" }} tickLine={false} axisLine={false}
                />
                <Tooltip
                  contentStyle={{ borderRadius: "0.75rem", border: "1px solid var(--card-border)", background: "var(--card)", fontSize: "0.75rem", padding: "0.375rem 0.625rem" }}
                  labelFormatter={(v) => new Date(Number(v)).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  formatter={(val) => [`${(Number(val) / 1000).toFixed(2).replace(".", ",")} kW`, t("solar.now")]}
                />
                <Area type="monotone" dataKey="value" stroke={SOLAR_COLOR} strokeWidth={2} fill="url(#solarFill)" isAnimationActive={false} connectNulls />
              </AreaChart>
            ) : (
              <BarChart data={hist.points} margin={{ top: 6, right: 8, bottom: 0, left: 0 }}>
                <CartesianGrid stroke="var(--card-border)" strokeDasharray="3 3" vertical={false} />
                <XAxis
                  dataKey="t" type="number" scale="time" domain={["dataMin", "dataMax"]}
                  tickFormatter={(v) => new Date(Number(v)).toLocaleDateString([], { day: "numeric", month: "short" })}
                  tick={{ fontSize: 10, fill: "var(--muted)" }} tickLine={false} axisLine={false} minTickGap={24}
                />
                <YAxis
                  width={40} tickCount={4}
                  tickFormatter={(v) => String(Math.round(Number(v)))}
                  tick={{ fontSize: 10, fill: "var(--muted)" }} tickLine={false} axisLine={false}
                />
                <Tooltip
                  contentStyle={{ borderRadius: "0.75rem", border: "1px solid var(--card-border)", background: "var(--card)", fontSize: "0.75rem", padding: "0.375rem 0.625rem" }}
                  labelFormatter={(v) => new Date(Number(v)).toLocaleDateString([], { day: "numeric", month: "short" })}
                  formatter={(val) => [`${formatKwh(Number(val))} kWh`, t("solar.title")]}
                />
                <Bar dataKey="value" fill={SOLAR_COLOR} radius={[3, 3, 0, 0]} isAnimationActive={false} />
              </BarChart>
            )}
          </ResponsiveContainer>
        )}
      </div>

      <div className="mt-4 flex gap-2">
        <Stat k={t(RANGE_LABEL_KEY[range])} v={`${formatKwh(hist.producedKwh)} kWh`} />
        <Stat k={netLabel} v={netValue} color={netColor} />
        <Stat k={t("solar.coverage")} v={`${formatPercent(solar.coveragePct)}%`} />
      </div>
    </Card>
  );
}
```

> Verifieer dat `Sun` bestaat in de lucide-versie: `node -e "console.log(!!require('lucide-react').Sun)"` moet `true` printen. Zo niet, gebruik `SunMedium`.

- [ ] **Step 5: Run test → verwacht PASS**

Run: `npm test -- app/components/SolarCard.test.tsx`
Expected: PASS (3 cases groen).

- [ ] **Step 6: Verify & checkpoint**

Run: `npm test && npx tsc --noEmit && npm run lint`
Expected: alles groen.

---

### Task 7: Inhaken in home-grid + settings-herordening

**Files:**
- Modify: `lib/home-cards.ts` (`defaultCardIds` → `"solar"` vooraan)
- Modify: `app/page.tsx` (`Unit` + bouwloop + render)
- Modify: `app/settings/page.tsx` (`CardType` + icon + label-key + cards-rij)
- Test: `lib/home-cards.test.ts` (bestaand — voeg case toe)

**Interfaces:**
- Consumes: `SolarCard` (Task 6), `AppState.solar` (Task 1), `defaultCardIds`/`orderCardIds` (bestaand), `widget.typeSolar`/`solar.title` (Task 6).

- [ ] **Step 1: Schrijf de falende test**

Voeg toe aan `lib/home-cards.test.ts` (gebruik een complete `AppState` inclusief het nieuwe `solar`-veld):

```typescript
it("always lists solar first by default", () => {
  const state: AppState = {
    chills: [], thermostat: null, rooms: [], metrics: [],
    solar: { available: false, currentPowerW: null, netGridKw: null, gridDirection: "idle", coveragePct: null, lifetimeKwh: null },
  };
  expect(defaultCardIds(state)[0]).toBe("solar");
});
```

(Importeer `AppState` als dat nog niet gebeurt; bestaande fixtures in dit bestand kregen het `solar`-veld al in Task 1, Step 7.)

- [ ] **Step 2: Run test → verwacht FAIL**

Run: `npm test -- lib/home-cards.test.ts`
Expected: FAIL — `defaultCardIds(state)[0]` is niet `"solar"`.

- [ ] **Step 3: Voeg solar toe aan `defaultCardIds`**

In `lib/home-cards.ts`, vervang de start van `defaultCardIds`:

```typescript
export function defaultCardIds(state: AppState): string[] {
  const ids: string[] = ["solar"];
  if (state.rooms.length > 0) ids.push("lights");
  if (state.thermostat) ids.push("thermostat");
  for (const c of state.chills) ids.push(c.id);
  for (const r of state.metrics) {
    if (r.metrics.some((m) => m.visible)) ids.push(r.key);
  }
  return ids;
}
```

- [ ] **Step 4: Run test → verwacht PASS**

Run: `npm test -- lib/home-cards.test.ts`
Expected: PASS.

- [ ] **Step 5: Haak `SolarCard` in de home-grid**

In `app/page.tsx`:

1. Voeg de import toe (bij de andere component-imports):
```typescript
import { SolarCard } from "@/app/components/SolarCard";
```
2. Voeg `SolarState` toe aan de type-import:
```typescript
import type { AppState, ChillState, RoomMetrics, SolarState } from "@/lib/types";
```
3. Breid de `Unit`-union uit:
```typescript
type Unit =
  | { kind: "lights" }
  | { kind: "thermostat" }
  | { kind: "chill"; chill: ChillState }
  | { kind: "metric"; room: RoomMetrics }
  | { kind: "pair"; rooms: RoomMetrics[] }
  | { kind: "solar"; solar: SolarState };
```
4. In de bouwloop van `HomeGrid`, vóór de chill-fallback, voeg een tak toe. Vervang het `else`-blok:
```typescript
    if (id === "lights") units.push({ id, unit: { kind: "lights" } });
    else if (id === "thermostat") units.push({ id, unit: { kind: "thermostat" } });
    else if (id === "solar") units.push({ id, unit: { kind: "solar", solar: state.solar } });
    else {
      const c = chillById.get(id);
      if (c) units.push({ id, unit: { kind: "chill", chill: c } });
    }
```
5. In de render, naast de andere `unit.kind`-takken:
```typescript
          {unit.kind === "solar" && <SolarCard solar={unit.solar} />}
```

- [ ] **Step 6: Toon solar in de settings-herordening**

In `app/settings/page.tsx`:

1. Voeg `Sun` toe aan de lucide-import.
2. Breid het `CardType`-type en de maps uit:
```typescript
type CardType = "lights" | "thermostat" | "chill" | "metric" | "solar";
const TYPE_ICON: Record<CardType, typeof Lightbulb> = {
  lights: Lightbulb,
  thermostat: Gauge,
  chill: Snowflake,
  metric: LineChart,
  solar: Sun,
};
const TYPE_LABEL_KEY = {
  lights: "widget.typeLights",
  thermostat: "widget.typeThermostat",
  chill: "widget.typeClimate",
  metric: "widget.typeMetric",
  solar: "widget.typeSolar",
} as const;
```
3. Zet de solar-rij vooraan in de `cards`-array (vóór `lights`), zodat de volgorde `defaultCardIds` spiegelt:
```typescript
  const cards: CardRow[] = [
    { id: "solar", label: t("solar.title"), type: "solar" as const },
    ...(hasLights ? [{ id: "lights", label: t("lights.section"), type: "lights" as const }] : []),
    ...(thermostatName ? [{ id: "thermostat", label: thermostatName, type: "thermostat" as const }] : []),
    ...chills.map((c) => ({ id: c.id, label: c.name, type: "chill" as const })),
    ...metrics.map((r) => ({ id: r.key, label: r.name, type: "metric" as const, room: r })),
  ];
```

- [ ] **Step 7: Verify & checkpoint**

Run: `npm test && npx tsc --noEmit && npm run lint`
Expected: alles groen.

- [ ] **Step 8: Handmatige rooktest tegen de echte HA**

Run: `npm run dev` en open de app.
Expected: bovenaan staat de **Zonnepanelen**-kaart; 's nachts toont de hero `0,00 kW`, dekking `0%`, net = afname (amber), en de Vandaag-curve is vlak/leeg met "Nog geen data". Wissel het bereik naar Week/Maand/Jaar → kWh-staven verschijnen. In Instellingen is de kaart sleepbaar met een zon-icoon.

---

## Self-Review

**1. Spec-dekking:**
- Hero live kW → Task 1 (`mapSolar.currentPowerW`) + Task 6 (render). ✅
- Dagcurve + Week/Maand/Jaar → Task 3 (transforms) + Task 4 (route) + Task 6 (Area/Bar). ✅
- 3 stats (periode-kWh, net-flow, dekking) → Task 6 (stats) met live net/dekking uit Task 1. ✅
- "Vandaag kWh" afgeleid uit lifetime-delta → Task 3 (`energyBuckets`) + Task 4 (today-tak). ✅
- HA-history via REST → Task 2 (`getHistory`). ✅
- Live via 3s-poll, grafiek apart → Task 1 (`AppState.solar` in `/api/state`) + Task 6 (eigen fetch). ✅
- Plaatsing + herordening → Task 7 (`defaultCardIds`, page, settings). ✅
- Randgevallen (nacht/0, unavailable, history-fout, negatieve delta) → Task 1 (`available`/`idle`), Task 3 (clamp/null), Task 4 (lege payload), Task 6 (empty state). ✅
- nl-NL + i18n → Task 5 (formatters) + Task 6 (strings). ✅
- Buiten v1 (forecast/prijs/CO₂/batterij) → niet ingepland. ✅

**2. Placeholder-scan:** Geen TBD/TODO/"implement later"; geen vage "add error handling". Alle code-stappen bevatten volledige, geldige code en assertions.

**3. Type-consistentie:** `SolarState`/`SolarHistoryResponse`/`SolarRange`/`SolarHistoryPoint` (Task 1) worden identiek geconsumeerd in Tasks 4 & 6. `getHistory(entityId,startISO,endISO)` (Task 2) wordt zo aangeroepen in Task 4. `parseHistory`/`downsamplePower`/`energyBuckets`/`sumKwh`/`dayBoundaries`/`monthBoundaries` (Task 3) matchen de imports in Task 4. `formatKw`/`formatKwh`/`formatPercent`/`wattsToKw` (Task 5) matchen de calls in Task 6. `SOLAR`-keys (Task 1) matchen Task 4. ✅
