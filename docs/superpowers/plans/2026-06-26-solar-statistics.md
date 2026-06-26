# Long-term statistics als energiebron (v3) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** De periode-totalen (kosten-kWh én productie-kWh voor week/maand/jaar) uit HA's long-term statistics halen i.p.v. de ~10-daagse historie, zodat maand/jaar én de zeldzame dal-teruglevering kloppen. De "vandaag" power-curve blijft realtime.

**Architecture:** Een dunne WebSocket-client `lib/ha-stats.ts` (`getStatistics`) leest `recorder/statistics_during_period` (per punt een `change`-delta). Een pure `lib/stats-energy.ts` zet `change`-punten om naar kosten-energie en grafiek-bars. De route gebruikt beide; de v2 history-bucketing (`periodDelta`, `energyBuckets`, `lifetimeAt`) wordt verwijderd.

**Tech Stack:** Next.js 16.2.9, React 19, TypeScript (Node 22 global `WebSocket`), Vitest.

## Global Constraints

- **Niet-standaard Next.js 16** (AGENTS.md): lees de relevante gids in `node_modules/next/dist/docs/` vóór de route-wijziging. Route-handler ongewijzigd.
- **Node 22 heeft global `WebSocket`** (geverifieerd) — geen `ws`-package nodig.
- **Eenheden:** metertellers zijn kWh (`change` in kWh, scale 1); `solaredge_lifetime_energy` is Wh (`change` in Wh → scale 0.001 voor kWh).
- **`SolarHistoryResponse`-vorm blijft identiek** (`points`, `summary.{producedKwh, cost}`) → widget ongewijzigd.
- **WS-config** spiegelt `ha-client`: basis = `HA_URL` of `http://supervisor/core`; `http`→`ws`/`https`→`wss`; `/api/websocket`; auth-token `HA_TOKEN` of `SUPERVISOR_TOKEN`.
- **Tests**: Vitest. De WS-client krijgt een injecteerbare `connect` zodat een fake-WS de auth/protocol-logica test; de route mockt `@/lib/ha-stats`.
- **Git**: branch `feat/solar-statistics`. Na elke taak `npm test && npx tsc --noEmit && npm run lint` (PRE-EXISTING lint-fouten in ongerelateerde bestanden negeren; geen nieuwe). Commit-trailer:
  Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01BPUtdakJE9JBe1QUhtL51h

---

### Task 1: WebSocket statistics-client `lib/ha-stats.ts`

**Files:**
- Create: `lib/ha-stats.ts`
- Test: `lib/ha-stats.test.ts`

**Interfaces:**
- Produces: `interface StatPoint { start: number; end: number; change: number | null }`; `getStatistics(ids: string[], startISO: string, endISO: string, period: "hour"|"day"|"month", opts?: { connect?: (url: string) => WSLike; timeoutMs?: number }): Promise<Record<string, StatPoint[]>>`.

- [ ] **Step 1: Schrijf de falende test**

Maak `lib/ha-stats.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { getStatistics } from "@/lib/ha-stats";

type Handler = ((ev: { data: string }) => void) | null;
function fakeWS() {
  const ws: { sent: string[]; onopen: Handler; onmessage: Handler; onerror: ((e: unknown) => void) | null; closed: boolean; send(d: string): void; close(): void } = {
    sent: [], onopen: null, onmessage: null, onerror: null, closed: false,
    send(d: string) { this.sent.push(d); }, close() { this.closed = true; },
  };
  return ws;
}
function emit(ws: ReturnType<typeof fakeWS>, obj: unknown) { ws.onmessage?.({ data: JSON.stringify(obj) }); }

beforeEach(() => { vi.stubEnv("HA_URL", "http://ha.test:8123"); vi.stubEnv("HA_TOKEN", "tok"); });
afterEach(() => vi.unstubAllEnvs());

describe("getStatistics", () => {
  it("authenticates, sends the statistics command, and resolves parsed change points", async () => {
    const ws = fakeWS();
    const p = getStatistics(["sensor.a", "sensor.b"], "2026-06-01T00:00:00Z", "2026-06-26T00:00:00Z", "day", { connect: () => ws });
    emit(ws, { type: "auth_required" });
    expect(JSON.parse(ws.sent[0])).toEqual({ type: "auth", access_token: "tok" });
    emit(ws, { type: "auth_ok" });
    const cmd = JSON.parse(ws.sent[1]);
    expect(cmd).toMatchObject({ type: "recorder/statistics_during_period", period: "day", statistic_ids: ["sensor.a", "sensor.b"], types: ["change"], start_time: "2026-06-01T00:00:00Z", end_time: "2026-06-26T00:00:00Z" });
    emit(ws, { id: cmd.id, type: "result", success: true, result: {
      "sensor.a": [{ start: 1, end: 2, change: 1.5 }, { start: 2, end: 3, change: 2.0 }],
      "sensor.b": [{ start: 1, end: 2, change: 0 }],
    } });
    await expect(p).resolves.toEqual({
      "sensor.a": [{ start: 1, end: 2, change: 1.5 }, { start: 2, end: 3, change: 2.0 }],
      "sensor.b": [{ start: 1, end: 2, change: 0 }],
    });
    expect(ws.closed).toBe(true);
  });

  it("rejects on auth_invalid", async () => {
    const ws = fakeWS();
    const p = getStatistics(["sensor.a"], "s", "e", "day", { connect: () => ws });
    emit(ws, { type: "auth_required" });
    emit(ws, { type: "auth_invalid" });
    await expect(p).rejects.toThrow();
  });

  it("rejects when the result is not successful", async () => {
    const ws = fakeWS();
    const p = getStatistics(["sensor.a"], "s", "e", "day", { connect: () => ws });
    emit(ws, { type: "auth_required" });
    emit(ws, { type: "auth_ok" });
    emit(ws, { type: "result", success: false, error: { message: "nope" } });
    await expect(p).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run test → verwacht FAIL**

Run: `npm test -- lib/ha-stats.test.ts`
Expected: FAIL — module bestaat niet.

- [ ] **Step 3: Implementeer `lib/ha-stats.ts`**

```typescript
export interface StatPoint {
  start: number;
  end: number;
  change: number | null;
}

export interface WSLike {
  send(data: string): void;
  close(): void;
  onopen: ((ev?: unknown) => void) | null;
  onmessage: ((ev: { data: string }) => void) | null;
  onerror: ((ev: unknown) => void) | null;
}
type Connect = (url: string) => WSLike;

function wsBaseUrl(): string {
  const url = process.env.HA_URL || (process.env.SUPERVISOR_TOKEN ? "http://supervisor/core" : undefined);
  if (!url) throw new Error("HA_URL not configured");
  return url.replace(/\/$/, "").replace(/^http/, "ws") + "/api/websocket";
}
function authToken(): string {
  const t = process.env.HA_TOKEN || process.env.SUPERVISOR_TOKEN;
  if (!t) throw new Error("HA_TOKEN not configured");
  return t;
}

/** Read HA long-term statistics (`recorder/statistics_during_period`) over a single
 *  short-lived WebSocket connection. Returns each id's `change` points. */
export function getStatistics(
  ids: string[],
  startISO: string,
  endISO: string,
  period: "hour" | "day" | "month",
  opts: { connect?: Connect; timeoutMs?: number } = {},
): Promise<Record<string, StatPoint[]>> {
  const connect: Connect = opts.connect ?? ((url) => new WebSocket(url) as unknown as WSLike);
  const ws = connect(wsBaseUrl());
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => finish(() => reject(new Error("statistics timeout"))), opts.timeoutMs ?? 20000);
    function finish(fn: () => void) {
      clearTimeout(timer);
      try { ws.close(); } catch { /* ignore */ }
      fn();
    }
    ws.onerror = () => finish(() => reject(new Error("statistics ws error")));
    ws.onmessage = (ev) => {
      let m: { type?: string; success?: boolean; result?: Record<string, Array<{ start: number; end: number; change?: number | null }>> };
      try { m = JSON.parse(ev.data); } catch { return; }
      if (m.type === "auth_required") {
        ws.send(JSON.stringify({ type: "auth", access_token: authToken() }));
        return;
      }
      if (m.type === "auth_invalid") { finish(() => reject(new Error("statistics auth invalid"))); return; }
      if (m.type === "auth_ok") {
        ws.send(JSON.stringify({ id: 1, type: "recorder/statistics_during_period", start_time: startISO, end_time: endISO, period, statistic_ids: ids, types: ["change"] }));
        return;
      }
      if (m.type === "result") {
        if (!m.success) { finish(() => reject(new Error("statistics request failed"))); return; }
        const out: Record<string, StatPoint[]> = {};
        const r = m.result ?? {};
        for (const id of Object.keys(r)) {
          out[id] = r[id].map((p) => ({ start: p.start, end: p.end, change: p.change ?? null }));
        }
        finish(() => resolve(out));
      }
    };
  });
}
```

- [ ] **Step 4: Run test → verwacht PASS**

Run: `npm test -- lib/ha-stats.test.ts`
Expected: PASS.

- [ ] **Step 5: Verify & commit**

Run: `npm test && npx tsc --noEmit && npm run lint` → commit.

---

### Task 2: Pure transforms `lib/stats-energy.ts`

**Files:**
- Create: `lib/stats-energy.ts`
- Test: `lib/stats-energy.test.ts`

**Interfaces:**
- Consumes: `StatPoint` (S1), `SolarHistoryPoint` (types).
- Produces: `sumChange(points: StatPoint[] | undefined, scale?: number): number | null`; `barPoints(points: StatPoint[] | undefined, scale?: number): SolarHistoryPoint[]`.

- [ ] **Step 1: Schrijf de falende test**

Maak `lib/stats-energy.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { sumChange, barPoints } from "@/lib/stats-energy";
import type { StatPoint } from "@/lib/ha-stats";

const pts = (xs: Array<[number, number | null]>): StatPoint[] => xs.map(([t, c], i) => ({ start: t, end: t + 1, change: c }));

describe("sumChange", () => {
  it("sums change at scale 1 (meters, kWh)", () => {
    expect(sumChange(pts([[1, 0.282], [2, 0.5]]))).toBe(0.782);
  });
  it("applies the Wh→kWh scale (0.001) for the solar sensor", () => {
    expect(sumChange(pts([[1, 1600], [2, 1400]]), 0.001)).toBe(3);
  });
  it("treats zero change as a real value (sparse feed-in)", () => {
    expect(sumChange(pts([[1, 0], [2, 0]]))).toBe(0);
  });
  it("returns null for missing or empty input", () => {
    expect(sumChange(undefined)).toBeNull();
    expect(sumChange([])).toBeNull();
  });
});

describe("barPoints", () => {
  it("maps change points to {t,value} bars with scale", () => {
    expect(barPoints(pts([[100, 5000], [200, 3000]]), 0.001)).toEqual([
      { t: 100, value: 5 }, { t: 200, value: 3 },
    ]);
  });
  it("passes null change through as null", () => {
    expect(barPoints(pts([[100, null]]))).toEqual([{ t: 100, value: null }]);
  });
  it("returns [] for missing input", () => {
    expect(barPoints(undefined)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test → verwacht FAIL**

Run: `npm test -- lib/stats-energy.test.ts`
Expected: FAIL — module bestaat niet.

- [ ] **Step 3: Implementeer `lib/stats-energy.ts`**

```typescript
import type { StatPoint } from "@/lib/ha-stats";
import type { SolarHistoryPoint } from "@/lib/types";

/** Som van `change` over de punten, geschaald (meters: 1; solar Wh→kWh: 0.001).
 *  null wanneer er geen punten/numerieke waarden zijn. Zero is een echte waarde. */
export function sumChange(points: StatPoint[] | undefined, scale = 1): number | null {
  if (!points || points.length === 0) return null;
  const vals = points.map((p) => p.change).filter((v): v is number => v != null);
  if (vals.length === 0) return null;
  return Math.round(vals.reduce((a, b) => a + b, 0) * scale * 1000) / 1000;
}

/** Statistics-punten → grafiek-bars (per-bucket waarde), geschaald. */
export function barPoints(points: StatPoint[] | undefined, scale = 1): SolarHistoryPoint[] {
  return (points ?? []).map((p) => ({
    t: p.start,
    value: p.change != null ? Math.round(p.change * scale * 100) / 100 : null,
  }));
}
```

- [ ] **Step 4: Run test → verwacht PASS**

Run: `npm test -- lib/stats-energy.test.ts`
Expected: PASS.

- [ ] **Step 5: Verify & commit**

Run: `npm test && npx tsc --noEmit && npm run lint` → commit.

---

### Task 3: Route — kosten & productie uit statistics

**Files:**
- Modify: `app/api/solar-history/route.ts`
- Test: `app/api/solar-history/route.test.ts` (bestaand — vervang de history-gebaseerde mocks door `@/lib/ha-stats`-mocks)

**Interfaces:**
- Consumes: `getStatistics` (S1), `sumChange`/`barPoints` (S2), `computeTariffCost` (bestaand), `getSettings`, `getHistory` (alleen nog voor de vandaag power-curve), `SOLAR`/`GRID_METER`, `parseHistory`/`downsamplePower`/`dayBoundaries`/`monthBoundaries`, types.

- [ ] **Step 1: Lees de Next.js route-conventie** (Global Constraints) en bekijk de huidige `route.ts`.

- [ ] **Step 2: Schrijf de falende test**

In `app/api/solar-history/route.test.ts`: behoud de `@/lib/ha-client`-mock (voor de vandaag power-curve `getHistory`), de `getSettings`-mock, `vi.setSystemTime` en mock-priming. Voeg een mock voor `@/lib/ha-stats` toe en vervang de v2 kosten/bars-cases. Bovenin:

```typescript
vi.mock("@/lib/ha-stats", () => ({ getStatistics: vi.fn() }));
import { getStatistics } from "@/lib/ha-stats";
const mockStats = getStatistics as unknown as ReturnType<typeof vi.fn>;
```

In `beforeEach` (na de bestaande resets): default een lege geschiedenis voor de power-curve en een statistics-resultaat:

```typescript
  mockHistory.mockResolvedValue([]); // today power curve (getHistory)
  mockStats.mockResolvedValue({});   // overridden per test
```

Cases:

```typescript
it("computes month cost from statistics change (no longer null)", async () => {
  mockSettings.mockReturnValue({ tariff: { mode: "simple", importPrice: 0.25, exportPrice: 0.1, importLow: null, importHigh: null, feedInPrice: null, fixedFeedInPerDay: null } });
  mockStats.mockResolvedValue({
    "sensor.electricity_meter_energy_consumption_tarif_1": [{ start: 1, end: 2, change: 30 }],
    "sensor.electricity_meter_energy_consumption_tarif_2": [{ start: 1, end: 2, change: 14 }], // import 44
    "sensor.electricity_meter_energy_production_tarif_1": [{ start: 1, end: 2, change: 0 }],    // sparse dal -> 0, not null
    "sensor.electricity_meter_energy_production_tarif_2": [{ start: 1, end: 2, change: 5 }],
    "sensor.solaredge_lifetime_energy": [{ start: 1, end: 2, change: 50000 }],
  });
  const body = await (await GET(req("month"))).json();
  expect(body.summary.cost.importKwh).toBe(44);
  expect(body.summary.cost.importCost).toBe(11);   // realistic, not null
  expect(body.summary.cost.exportKwh).toBe(5);      // 0 + 5, dal counted as 0 not null
  expect(body.summary.producedKwh).toBe(50);        // 50000 Wh -> 50 kWh
  expect(body.points.length).toBe(1);               // bars from solar change
});

it("returns cost null and empty bars when statistics fail, without throwing", async () => {
  mockSettings.mockReturnValue({ tariff: { mode: "simple", importPrice: 0.25, exportPrice: 0.1, importLow: null, importHigh: null, feedInPrice: null, fixedFeedInPerDay: null } });
  mockStats.mockRejectedValue(new Error("ws down"));
  const res = await GET(req("week"));
  expect(res.status).toBe(200);
  const body = await res.json();
  expect(body.summary.cost).toBeNull();
  expect(body.points).toEqual([]);
});

it("uses period hour for today and keeps the live power curve", async () => {
  mockStats.mockResolvedValue({ "sensor.solaredge_lifetime_energy": [{ start: 1, end: 2, change: 1400 }] });
  const body = await (await GET(req("today"))).json();
  expect(body.chartType).toBe("power");
  expect(mockStats).toHaveBeenCalledWith(expect.any(Array), expect.any(String), expect.any(String), "hour");
  expect(body.summary.producedKwh).toBe(1.4);
});
```

- [ ] **Step 3: Run test → verwacht FAIL**

Run: `npm test -- app/api/solar-history/route.test.ts`
Expected: FAIL — route gebruikt nog history-bucketing.

- [ ] **Step 4: Herschrijf de route**

In `app/api/solar-history/route.ts`, vervang de imports en de body. Imports:

```typescript
import { getHistory, statusForError } from "@/lib/ha-client";
import { getStatistics } from "@/lib/ha-stats";
import { sumChange, barPoints } from "@/lib/stats-energy";
import { SOLAR, GRID_METER } from "@/config/devices";
import { parseHistory, downsamplePower, dayBoundaries, monthBoundaries } from "@/lib/solar-history";
import { computeTariffCost } from "@/lib/solar-cost";
import { getSettings } from "@/lib/settings-store";
import type { SolarRange, SolarHistoryResponse, ElectricityTariff } from "@/lib/types";

export const dynamic = "force-dynamic";

const RANGES = ["today", "week", "month", "year"] as const;
const DAY_MS = 86_400_000;
const STAT_IDS = [GRID_METER.importT1, GRID_METER.importT2, GRID_METER.exportT1, GRID_METER.exportT2, SOLAR.lifetimeEnergy];

function tariffActive(t: ElectricityTariff): boolean {
  return t.mode === "advanced"
    ? t.importLow != null || t.importHigh != null || t.feedInPrice != null || t.fixedFeedInPerDay != null
    : t.importPrice != null || t.exportPrice != null;
}
function rangeStart(r: SolarRange, now: number): number {
  if (r === "today") return dayBoundaries(now, 1)[0];
  if (r === "week") return dayBoundaries(now, 7)[0];
  if (r === "month") return dayBoundaries(now, 30)[0];
  return monthBoundaries(now, 12)[0];
}
function statPeriod(r: SolarRange): "hour" | "day" | "month" {
  if (r === "today") return "hour";
  if (r === "year") return "month";
  return "day";
}
function costFromStats(stats: Record<string, import("@/lib/ha-stats").StatPoint[]>, tariff: ElectricityTariff, days: number): SolarHistoryResponse["summary"]["cost"] {
  if (!tariffActive(tariff)) return null;
  return computeTariffCost({
    afnameLow: sumChange(stats[GRID_METER.importT1]),
    afnameHigh: sumChange(stats[GRID_METER.importT2]),
    terugLow: sumChange(stats[GRID_METER.exportT1]),
    terugHigh: sumChange(stats[GRID_METER.exportT2]),
  }, tariff, days);
}

export async function GET(req: Request): Promise<Response> {
  const range = new URL(req.url).searchParams.get("range") ?? "";
  if (!(RANGES as readonly string[]).includes(range)) {
    return Response.json({ error: "bad_request" }, { status: 400 });
  }
  const r = range as SolarRange;
  const now = Date.now();
  const start = rangeStart(r, now);
  const iso = (ms: number) => new Date(ms).toISOString();
  const tariff = getSettings().tariff;

  // Statistics power the totals (cost + production). A failure degrades to cost:null + empty bars.
  let stats: Record<string, import("@/lib/ha-stats").StatPoint[]> | null = null;
  try {
    stats = await getStatistics(STAT_IDS, iso(start), iso(now), statPeriod(r));
  } catch {
    stats = null;
  }
  const days = (now - start) / DAY_MS;
  const cost = stats ? costFromStats(stats, tariff, days) : null;
  const producedKwh = stats ? sumChange(stats[SOLAR.lifetimeEnergy], 0.001) : null;

  try {
    if (r === "today") {
      const powerRaw = await getHistory(SOLAR.currentPower, iso(start), iso(now));
      const points = downsamplePower(parseHistory(powerRaw), start, now, 48);
      const body: SolarHistoryResponse = { range: r, chartType: "power", unit: "W", points, summary: { producedKwh, cost } };
      return Response.json(body);
    }
    const points = stats ? barPoints(stats[SOLAR.lifetimeEnergy], 0.001) : [];
    const body: SolarHistoryResponse = { range: r, chartType: "energy", unit: "kWh", points, summary: { producedKwh, cost } };
    return Response.json(body);
  } catch (e) {
    const empty: SolarHistoryResponse = {
      range: r, chartType: r === "today" ? "power" : "energy", unit: r === "today" ? "W" : "kWh",
      points: [], summary: { producedKwh: null, cost: null },
    };
    return Response.json(empty, { status: statusForError(e) });
  }
}
```

- [ ] **Step 5: Run test → verwacht PASS**

Run: `npm test -- app/api/solar-history/route.test.ts`
Expected: PASS.

- [ ] **Step 6: Verify & commit**

Run: `npm test && npx tsc --noEmit && npm run lint` → commit. (De volledige suite kan nog dode-functie-tests bevatten; die worden in S4 verwijderd. Als de suite hier al rood is door ongebruikte imports, los dat in S4 op — maar `npm test` moet groen zijn.)

---

### Task 4: Verwijder de dode history-bucketing

**Files:**
- Modify: `lib/solar-history.ts` (verwijder `periodDelta`, `energyBuckets`, `lifetimeAt`)
- Test: `lib/solar-history.test.ts` (verwijder de tests voor die functies)

**Interfaces:**
- Behoudt: `parseHistory`, `downsamplePower`, `dayBoundaries`, `monthBoundaries`, `sumKwh`, `RawPoint`, `RETENTION_MS`/`RANGE_MS`/`alignToHalfHour`/`appendAndPrune` (alles wat elders nog gebruikt wordt).

- [ ] **Step 1: Bevestig dat de functies dood zijn**

Run: `grep -rn "periodDelta\|energyBuckets\|lifetimeAt" app lib --include=*.ts | grep -v "solar-history"`
Expected: geen treffers buiten `solar-history.ts`/zijn test (S3 verwijderde de route-usage). Als er nog een gebruiker is, stop en meld het.

- [ ] **Step 2: Verwijder de tests voor de dode functies**

In `lib/solar-history.test.ts`: verwijder de `describe`-blokken voor `periodDelta` en `energyBuckets` (en eventuele `lifetimeAt`-cases). Behoud de tests voor `parseHistory`, `downsamplePower`, `sumKwh`, `dayBoundaries`, `monthBoundaries`.

- [ ] **Step 3: Run test → verwacht FAIL (of nog groen)**

Run: `npm test -- lib/solar-history.test.ts`
Expected: groen na het verwijderen van de obsolete tests (geen verwijzing meer naar de te verwijderen functies).

- [ ] **Step 4: Verwijder de dode functies**

In `lib/solar-history.ts`: verwijder de exports `periodDelta` en `energyBuckets` en de private helper `lifetimeAt` (die alleen door die twee werd gebruikt). Laat `parseHistory`, `downsamplePower`, `dayBoundaries`, `monthBoundaries`, `sumKwh` en de overige helpers staan.

- [ ] **Step 5: Run de volledige suite + typecheck → verwacht PASS**

Run: `npm test && npx tsc --noEmit && npm run lint`
Expected: alles groen; geen dangling imports of ongebruikte-symbool-fouten.

- [ ] **Step 6: Commit**

Commit.

- [ ] **Step 7: Handmatige rooktest tegen live HA**

Run: dev-server (poort 3009 draait al of `npm run dev`). `curl "http://localhost:3009/api/solar-history?range=month"` → `summary.cost` en `producedKwh` zijn nu **niet-null en realistisch** (geen `—` meer), en `range=week` toont een niet-null `exportEarnings`/`exportKwh`.

---

## Self-Review

**1. Spec-dekking:**
- Statistics als bron → S1 (`getStatistics`) + S3 (route gebruikt het). ✅
- Pure transform (testbaar) → S2 (`sumChange`/`barPoints`). ✅
- Kosten alle bereiken + maand/jaar niet-null → S3 (route + test op `month`). ✅
- Productie-bars + producedKwh uit statistics (fix ondertelling) → S3 (`barPoints`/`sumChange` op solar). ✅
- Vandaag power-curve blijft realtime → S3 (`getHistory` + `downsamplePower`, period "hour" voor totalen). ✅
- Sparse dal-teruglevering `change:0` i.p.v. `—` → S2 (zero is echte waarde) + S3-test. ✅
- WS-fout graceful → S3 (try/catch → cost null + lege bars + 200). ✅
- Opruimen dode v2-bucketing → S4. ✅
- Widget-vorm ongewijzigd → geen widget-taak. ✅

**2. Placeholder-scan:** Geen TBD/TODO; alle code-stappen bevatten volledige code. De WS-client is testbaar gemaakt via een injecteerbare `connect`.

**3. Type-consistentie:** `StatPoint` (S1) ⇄ `sumChange`/`barPoints` (S2) ⇄ route (S3). `getStatistics`-signatuur (S1) ⇄ route-aanroep + route-test-mock (S3). `SolarHistoryResponse` (ongewijzigd) blijft de respons-vorm. S4 verwijdert alleen wat S3 niet meer importeert.
