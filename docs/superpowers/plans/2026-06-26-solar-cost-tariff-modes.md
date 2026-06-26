# Tarieven v2 (eenvoudig/geavanceerd + kostenbugfixes) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Een eenvoudig/geavanceerd tarief-toggle in Instellingen, met dubbeltarief en salderings-bewuste teruglevering in geavanceerde modus, en het herstellen van twee kostenbugs (kWh-eenheid + teruglever-baseline).

**Architecture:** `AppSettings.tariff` wordt uitgebreid (mode + dubbeltarief/teruglever-velden, backward-compatible). De pure `computeTariffCost` vervangt `tariffCost` en rekent per modus. De `/api/solar-history`-route berekent de periode-kWh per teller **kWh-native** (geen ÷1000) over een venster met **2-dagen marge** (zodat de beginstand altijd gevonden wordt) en roept `computeTariffCost` aan. De widget-kostenrij blijft ongewijzigd.

**Tech Stack:** Next.js 16.2.9, React 19, TypeScript, Zod, Vitest + @testing-library/react.

## Global Constraints

- **Niet-standaard Next.js 16** (AGENTS.md): lees de relevante gids in `node_modules/next/dist/docs/` vóór route-/componentwijzigingen. Route-handler ongewijzigd (`GET(req: Request)`, `export const dynamic = "force-dynamic"`).
- **HA-client REST-only**; hergebruik `getHistory`.
- **Geen nieuwe dependencies.**
- **Eenheden:** de `electricity_meter_*`-tellers staan in **kWh** → NOOIT door 1000 delen (dat is alleen voor de SolarEdge Wh-teller). Dit is de kern-bugfix.
- **nl-NL**: komma-decimaal; `—` voor null; euro `"€ 4,12"`.
- **i18n in twee talen**: elke nieuwe string in zowel `en`-const als `nl`-record in `lib/i18n.ts`.
- **Tests**: Vitest, co-located; component-tests met bestaande wrappers; `fetch` via `vi.stubGlobal`; de route-test houdt zijn bestaande `vi.setSystemTime`-pinning + mock-priming.
- **Git**: branch `feat/solar-cost-v2`. Na elke taak `npm test && npx tsc --noEmit && npm run lint` (PRE-EXISTING lint-fouten in ongerelateerde bestanden negeren; geen nieuwe introduceren), dan committen met trailer:
  Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01BPUtdakJE9JBe1QUhtL51h
- **Tarief-tellers:** `tarif_1` = dal (laag), `tarif_2` = normaal (hoog).

---

### Task 1: Uitgebreid tarief — types + settings-persistentie

**Files:**
- Modify: `lib/types.ts`
- Modify: `lib/settings-store.ts`
- Modify: `app/api/settings/route.ts`
- Test: `lib/settings-store.test.ts` (bestaand — werk de v1 tarief-tests bij + voeg toe)

**Interfaces:**
- Produces: `TariffMode`; uitgebreide `ElectricityTariff` (mode + `importLow/importHigh/feedInPrice/fixedFeedInPerDay`); tarief-sanitize/persistentie + zod-schema voor de nieuwe vorm.

- [ ] **Step 1: Werk de tests bij naar de nieuwe vorm (falend)**

In `lib/settings-store.test.ts`: de bestaande v1 tarief-tests vergelijken `s.tariff` met `{ importPrice, exportPrice }` — die kloppen niet meer. Vervang het `describe("tariff settings", …)`-blok door:

```typescript
describe("tariff settings", () => {
  const full = {
    mode: "simple" as const,
    importPrice: null, exportPrice: null,
    importLow: null, importHigh: null, feedInPrice: null, fixedFeedInPerDay: null,
  };
  it("defaults tariff to simple mode with null prices", () => {
    expect(getSettings().tariff).toEqual(full);
  });
  it("persists advanced dual-tariff fields", () => {
    const t = { ...full, mode: "advanced" as const, importLow: 0.22216, importHigh: 0.25514, feedInPrice: 0.14, fixedFeedInPerDay: 0.28747 };
    expect(updateSettings({ tariff: t }).tariff).toEqual(t);
    expect(getSettings().tariff).toEqual(t);
  });
  it("coerces negative/non-numeric prices to null and unknown mode to simple", () => {
    const t = updateSettings({ tariff: { ...full, mode: "bogus" as unknown as "simple", importLow: -1 as number, importHigh: "x" as unknown as number } }).tariff;
    expect(t.mode).toBe("simple");
    expect(t.importLow).toBeNull();
    expect(t.importHigh).toBeNull();
  });
  it("upgrades an old simple tariff (no mode) to mode=simple, keeping prices", () => {
    const t = updateSettings({ tariff: { importPrice: 0.25, exportPrice: 0.1 } as unknown as typeof full }).tariff;
    expect(t.mode).toBe("simple");
    expect(t.importPrice).toBe(0.25);
    expect(t.exportPrice).toBe(0.1);
  });
});
```

- [ ] **Step 2: Run test → verwacht FAIL**

Run: `npm test -- lib/settings-store.test.ts`
Expected: FAIL — `tariff` mist `mode`/nieuwe velden.

- [ ] **Step 3: Breid de types uit**

In `lib/types.ts`, vervang `ElectricityTariff` door:

```typescript
export type TariffMode = "simple" | "advanced";

export interface ElectricityTariff {
  mode: TariffMode;
  // eenvoudig
  importPrice: number | null;       // afnameprijs €/kWh
  exportPrice: number | null;       // terugleverprijs €/kWh
  // geavanceerd (dubbeltarief + saldering)
  importLow: number | null;         // afname dal (tarif_1) €/kWh
  importHigh: number | null;        // afname normaal (tarif_2) €/kWh
  feedInPrice: number | null;       // terugleververgoeding (overschot) €/kWh
  fixedFeedInPerDay: number | null; // vaste terugleverkosten €/dag
}
```

- [ ] **Step 4: Tarief in de settings-store**

In `lib/settings-store.ts`: importeer `TariffMode` uit `@/lib/types`. Voeg boven `sanitize` toe:

```typescript
const TARIFF_MODES: readonly TariffMode[] = ["simple", "advanced"];
```

Vervang in `defaults()` het tarief-veld door:

```typescript
    tariff: { mode: "simple", importPrice: null, exportPrice: null, importLow: null, importHigh: null, feedInPrice: null, fixedFeedInPerDay: null },
```

Vervang in `sanitize()` het bestaande `tariff`-blok door:

```typescript
  if (r.tariff && typeof r.tariff === "object" && !Array.isArray(r.tariff)) {
    const tr = r.tariff as Record<string, unknown>;
    out.tariff = {
      mode: typeof tr.mode === "string" && (TARIFF_MODES as readonly string[]).includes(tr.mode) ? (tr.mode as TariffMode) : "simple",
      importPrice: validPrice(tr.importPrice),
      exportPrice: validPrice(tr.exportPrice),
      importLow: validPrice(tr.importLow),
      importHigh: validPrice(tr.importHigh),
      feedInPrice: validPrice(tr.feedInPrice),
      fixedFeedInPerDay: validPrice(tr.fixedFeedInPerDay),
    };
  }
```

(`validPrice` bestaat al uit v1. `updateSettings` heeft al `tariff: patch.tariff ?? current.tariff`.)

- [ ] **Step 5: Tarief in het PUT-schema**

In `app/api/settings/route.ts`, vervang het `tariff`-veld in `patchSchema` door:

```typescript
  tariff: z
    .object({
      mode: z.enum(["simple", "advanced"]).optional(),
      importPrice: z.number().nonnegative().nullable().optional(),
      exportPrice: z.number().nonnegative().nullable().optional(),
      importLow: z.number().nonnegative().nullable().optional(),
      importHigh: z.number().nonnegative().nullable().optional(),
      feedInPrice: z.number().nonnegative().nullable().optional(),
      fixedFeedInPerDay: z.number().nonnegative().nullable().optional(),
    })
    .optional(),
```

- [ ] **Step 6: Run test → verwacht PASS**

Run: `npm test -- lib/settings-store.test.ts`
Expected: PASS.

- [ ] **Step 7: Repareer ElectricityTariff/AppSettings-fixtures**

Run: `npx tsc --noEmit`
Voor elke fout waar een `tariff`-literal velden mist (test-fixtures met `{ importPrice: null, exportPrice: null }`), vervang door het volledige default-object:

```typescript
tariff: { mode: "simple", importPrice: null, exportPrice: null, importLow: null, importHigh: null, feedInPrice: null, fixedFeedInPerDay: null },
```

Herhaal tot `npx tsc --noEmit` schoon is.

- [ ] **Step 8: Verify & commit**

Run: `npm test && npx tsc --noEmit && npm run lint` → commit.

---

### Task 2: `periodDelta` (kWh-native periode-delta)

**Files:**
- Modify: `lib/solar-history.ts`
- Test: `lib/solar-history.test.ts` (bestaand — voeg toe)

**Interfaces:**
- Produces: `periodDelta(points: RawPoint[], start: number, end: number): number | null` — geclampte delta in de **eigen eenheid** (geen /1000), null als een grensmeting ontbreekt.

- [ ] **Step 1: Schrijf de falende test**

Voeg toe aan `lib/solar-history.test.ts`:

```typescript
import { periodDelta } from "@/lib/solar-history";

describe("periodDelta", () => {
  it("returns the clamped delta in the sensor's own unit (no /1000)", () => {
    const pts = [{ t: 0, v: 18087.239 }, { t: 100, v: 18131.602 }];
    expect(periodDelta(pts, 0, 100)).toBe(44.363);
  });
  it("clamps a negative delta (counter reset) to 0", () => {
    expect(periodDelta([{ t: 0, v: 9000 }, { t: 100, v: 1000 }], 0, 100)).toBe(0);
  });
  it("uses the last reading at or before each boundary", () => {
    const pts = [{ t: 10, v: 100 }, { t: 50, v: 150 }, { t: 90, v: 220 }];
    expect(periodDelta(pts, 20, 100)).toBe(120); // lifetimeAt(20)=100, lifetimeAt(100)=220
  });
  it("returns null when no reading exists at or before start", () => {
    expect(periodDelta([{ t: 50, v: 150 }], 20, 100)).toBeNull();
  });
});
```

- [ ] **Step 2: Run test → verwacht FAIL**

Run: `npm test -- lib/solar-history.test.ts`
Expected: FAIL — `periodDelta` bestaat niet.

- [ ] **Step 3: Implementeer `periodDelta`**

In `lib/solar-history.ts`, voeg na `energyBuckets` toe (hergebruikt de bestaande private `lifetimeAt`):

```typescript
/** Geclampte cumulatieve delta over [start, end] in de eigen eenheid van de
 *  sensor (kWh voor de metertellers — GEEN /1000). null als de beginstand
 *  ontbreekt (geen meting op of vóór `start`). */
export function periodDelta(points: RawPoint[], start: number, end: number): number | null {
  const a = lifetimeAt(points, start);
  const b = lifetimeAt(points, end);
  return a != null && b != null ? Math.round(Math.max(0, b - a) * 1000) / 1000 : null;
}
```

- [ ] **Step 4: Run test → verwacht PASS**

Run: `npm test -- lib/solar-history.test.ts`
Expected: PASS.

- [ ] **Step 5: Verify & commit**

Run: `npm test && npx tsc --noEmit && npm run lint` → commit.

---

### Task 3: Kosten-herberekening — `computeTariffCost` + route (unit + baseline + saldering)

**Files:**
- Modify: `lib/solar-cost.ts` (vervang `tariffCost` door `computeTariffCost`)
- Modify: `app/api/solar-history/route.ts` (`computeCost` herschreven)
- Test: `lib/solar-cost.test.ts` (herschreven), `app/api/solar-history/route.test.ts` (bijgewerkt)

**Interfaces:**
- Consumes: `periodDelta` (Task 2), uitgebreide `ElectricityTariff` (Task 1), `GRID_METER`, `getSettings`, `getHistory`.
- Produces: `PeriodEnergy`, `CostResult`, `computeTariffCost(e, t, days)`.

- [ ] **Step 1: Schrijf de falende cost-tests**

Vervang de inhoud van `lib/solar-cost.test.ts` door:

```typescript
import { describe, it, expect } from "vitest";
import { computeTariffCost, type PeriodEnergy } from "@/lib/solar-cost";
import type { ElectricityTariff } from "@/lib/types";

const base: ElectricityTariff = {
  mode: "simple", importPrice: null, exportPrice: null,
  importLow: null, importHigh: null, feedInPrice: null, fixedFeedInPerDay: null,
};
const energy = (afnameLow: number | null, afnameHigh: number | null, terugLow: number | null, terugHigh: number | null): PeriodEnergy =>
  ({ afnameLow, afnameHigh, terugLow, terugHigh });

describe("computeTariffCost — simple", () => {
  it("totals kWh and multiplies by the flat prices (kWh-native, not /1000)", () => {
    const t = { ...base, importPrice: 0.25, exportPrice: 0.1 };
    const r = computeTariffCost(energy(30, 14, 2, 3), t, 7);
    expect(r.importKwh).toBe(44);
    expect(r.exportKwh).toBe(5);
    expect(r.importCost).toBe(11);   // 44 * 0.25  (NOT 0.011)
    expect(r.exportEarnings).toBe(0.5);
  });
  it("nulls a side whose price is missing", () => {
    const r = computeTariffCost(energy(30, 14, 2, 3), { ...base, importPrice: 0.25 }, 7);
    expect(r.importCost).toBe(11);
    expect(r.exportEarnings).toBeNull();
  });
});

describe("computeTariffCost — advanced (saldering-aware)", () => {
  const t: ElectricityTariff = { ...base, mode: "advanced", importLow: 0.22216, importHigh: 0.25514, feedInPrice: 0.14, fixedFeedInPerDay: 0.28747 };
  it("imports at dual tariff", () => {
    const r = computeTariffCost(energy(10, 20, 0, 0), t, 1);
    expect(r.importCost).toBe(Math.round((10 * 0.22216 + 20 * 0.25514) * 100) / 100); // 7.32
  });
  it("settles feed-in against consumption at the import price, surplus at feed-in rate, minus fixed/day", () => {
    // low: terug 8 vs afname 5 -> settled 5*0.22216, surplus 3*0.14
    // high: terug 2 vs afname 6 -> settled 2*0.25514, surplus 0
    // minus 1 day * 0.28747
    const r = computeTariffCost(energy(5, 6, 8, 2), t, 1);
    const expected = 5 * 0.22216 + 2 * 0.25514 + 3 * 0.14 + 0 - 1 * 0.28747;
    expect(r.exportEarnings).toBe(Math.round(expected * 100) / 100);
  });
  it("nulls cost when a required advanced price is missing", () => {
    const r = computeTariffCost(energy(5, 6, 8, 2), { ...t, importHigh: null }, 1);
    expect(r.importCost).toBeNull();
    expect(r.exportEarnings).toBeNull();
  });
});

describe("computeTariffCost — totals nulling", () => {
  it("nulls importKwh/exportKwh when a tariff bucket is null", () => {
    const r = computeTariffCost(energy(10, null, 2, 3), { ...base, importPrice: 0.25, exportPrice: 0.1 }, 7);
    expect(r.importKwh).toBeNull();
    expect(r.exportKwh).toBe(5);
  });
});
```

- [ ] **Step 2: Run test → verwacht FAIL**

Run: `npm test -- lib/solar-cost.test.ts`
Expected: FAIL — `computeTariffCost` bestaat niet.

- [ ] **Step 3: Herschrijf `lib/solar-cost.ts`**

Vervang de inhoud van `lib/solar-cost.ts` door:

```typescript
import type { ElectricityTariff } from "@/lib/types";

export interface PeriodEnergy {
  afnameLow: number | null;
  afnameHigh: number | null;
  terugLow: number | null;
  terugHigh: number | null;
}
export interface CostResult {
  importKwh: number | null;
  exportKwh: number | null;
  importCost: number | null;
  exportEarnings: number | null;
}

const r2 = (x: number) => Math.round(x * 100) / 100;

/** Kosten (afname) en opbrengst (teruglevering) over een termijn, per modus.
 *  Energiehoeveelheden zijn in kWh; bedragen in euro, afgerond op centen. */
export function computeTariffCost(e: PeriodEnergy, t: ElectricityTariff, days: number): CostResult {
  const importKwh = e.afnameLow != null && e.afnameHigh != null ? r2(e.afnameLow + e.afnameHigh) : null;
  const exportKwh = e.terugLow != null && e.terugHigh != null ? r2(e.terugLow + e.terugHigh) : null;

  let importCost: number | null = null;
  let exportEarnings: number | null = null;

  if (t.mode === "advanced") {
    if (e.afnameLow != null && e.afnameHigh != null && t.importLow != null && t.importHigh != null) {
      importCost = r2(e.afnameLow * t.importLow + e.afnameHigh * t.importHigh);
    }
    if (
      e.afnameLow != null && e.afnameHigh != null &&
      e.terugLow != null && e.terugHigh != null &&
      t.importLow != null && t.importHigh != null
    ) {
      const feed = t.feedInPrice ?? 0;
      const fixed = t.fixedFeedInPerDay ?? 0;
      const settledLow = Math.min(e.terugLow, e.afnameLow) * t.importLow;
      const settledHigh = Math.min(e.terugHigh, e.afnameHigh) * t.importHigh;
      const surplusLow = Math.max(0, e.terugLow - e.afnameLow) * feed;
      const surplusHigh = Math.max(0, e.terugHigh - e.afnameHigh) * feed;
      exportEarnings = r2(settledLow + settledHigh + surplusLow + surplusHigh - days * fixed);
    }
  } else {
    if (importKwh != null && t.importPrice != null) importCost = r2(importKwh * t.importPrice);
    if (exportKwh != null && t.exportPrice != null) exportEarnings = r2(exportKwh * t.exportPrice);
  }

  return { importKwh, exportKwh, importCost, exportEarnings };
}
```

- [ ] **Step 4: Run cost-test → verwacht PASS**

Run: `npm test -- lib/solar-cost.test.ts`
Expected: PASS.

- [ ] **Step 5: Werk de route-test bij (falend tegen de oude route)**

In `app/api/solar-history/route.test.ts`: behoud de bestaande `vi.mock("@/lib/ha-client")`, de `getSettings`-mock, `vi.setSystemTime` en mock-priming. Vervang de v1 kosten-cases (die Wh-schaal fixtures gebruikten) door realistische kWh-cases. Default in `beforeEach`: `mockSettings.mockReturnValue({ tariff: { mode: "simple", importPrice: null, exportPrice: null, importLow: null, importHigh: null, feedInPrice: null, fixedFeedInPerDay: null } })`.

```typescript
it("computes simple-mode cost in euros from kWh meters (not 1000x too low)", async () => {
  mockSettings.mockReturnValue({ tariff: { mode: "simple", importPrice: 0.25, exportPrice: 0.1, importLow: null, importHigh: null, feedInPrice: null, fixedFeedInPerDay: null } });
  // cumulative kWh meters; the route fetches from start-2d, delta over [weekStart, now]
  const meter = (start: string, end: string) => [
    { state: start, last_changed: "2026-06-18T00:00:00Z" }, // before weekStart (margin)
    { state: end, last_changed: "2026-06-25T00:00:00Z" },
  ];
  mockHistory.mockImplementation((id: string) => {
    if (id === "sensor.solaredge_lifetime_energy") return Promise.resolve(meter("0", "7000"));
    if (id === "sensor.electricity_meter_energy_consumption_tarif_1") return Promise.resolve(meter("0", "30"));
    if (id === "sensor.electricity_meter_energy_consumption_tarif_2") return Promise.resolve(meter("0", "14")); // import 44 kWh
    if (id === "sensor.electricity_meter_energy_production_tarif_1") return Promise.resolve(meter("0", "2"));
    if (id === "sensor.electricity_meter_energy_production_tarif_2") return Promise.resolve(meter("0", "3"));   // export 5 kWh
    return Promise.resolve([]);
  });
  const body = await (await GET(req("week"))).json();
  expect(body.summary.cost.importKwh).toBe(44);
  expect(body.summary.cost.importCost).toBe(11);   // 44 * 0.25 — guards the unit bug
  expect(body.summary.cost.exportKwh).toBe(5);
  expect(body.summary.cost.exportEarnings).toBe(0.5);
});

it("omits cost (null) when no usable tariff is set", async () => {
  mockHistory.mockResolvedValue([]);
  const body = await (await GET(req("week"))).json();
  expect(body.summary.cost).toBeNull();
});

it("returns cost null (not a throw) when a meter history fails", async () => {
  mockSettings.mockReturnValue({ tariff: { mode: "simple", importPrice: 0.25, exportPrice: 0.1, importLow: null, importHigh: null, feedInPrice: null, fixedFeedInPerDay: null } });
  mockHistory.mockImplementation((id: string) => id.startsWith("sensor.electricity_meter") ? Promise.reject(new Error("boom")) : Promise.resolve([]));
  const res = await GET(req("week"));
  expect(res.status).toBe(200);
  expect((await res.json()).summary.cost).toBeNull();
});
```

- [ ] **Step 6: Run route-test → verwacht FAIL**

Run: `npm test -- app/api/solar-history/route.test.ts`
Expected: FAIL — euro's nog 1000× te laag / `computeCost` gebruikt de oude helper.

- [ ] **Step 7: Herschrijf `computeCost` in de route**

In `app/api/solar-history/route.ts`: vervang de import `import { tariffCost } from "@/lib/solar-cost";` door `import { computeTariffCost } from "@/lib/solar-cost";`, voeg `periodDelta` toe aan de import uit `@/lib/solar-history`, voeg `GRID_METER` toe aan de devices-import, en `ElectricityTariff` aan de types-import. Voeg bovenin de module toe:

```typescript
const MARGIN_MS = 2 * 86_400_000;

function tariffActive(t: ElectricityTariff): boolean {
  return t.mode === "advanced"
    ? t.importLow != null || t.importHigh != null || t.feedInPrice != null || t.fixedFeedInPerDay != null
    : t.importPrice != null || t.exportPrice != null;
}
```

Vervang de hele `computeCost`-functie door:

```typescript
async function computeCost(
  start: number,
  now: number,
  tariff: ElectricityTariff,
  iso: (ms: number) => string,
): Promise<SolarHistoryResponse["summary"]["cost"]> {
  if (!tariffActive(tariff)) return null;
  try {
    const from = iso(start - MARGIN_MS);
    const to = iso(now);
    const [it1, it2, et1, et2] = await Promise.all([
      getHistory(GRID_METER.importT1, from, to),
      getHistory(GRID_METER.importT2, from, to),
      getHistory(GRID_METER.exportT1, from, to),
      getHistory(GRID_METER.exportT2, from, to),
    ]);
    const energy = {
      afnameLow: periodDelta(parseHistory(it1), start, now),
      afnameHigh: periodDelta(parseHistory(it2), start, now),
      terugLow: periodDelta(parseHistory(et1), start, now),
      terugHigh: periodDelta(parseHistory(et2), start, now),
    };
    return computeTariffCost(energy, tariff, (now - start) / 86_400_000);
  } catch {
    return null;
  }
}
```

(De `GET`-takken roepen `computeCost(start, now, tariff, iso)` resp. `computeCost(boundaries[0], now, tariff, iso)` al aan; die blijven ongewijzigd, net als de `cost: null` in de catch-tak.)

- [ ] **Step 8: Run route-test → verwacht PASS**

Run: `npm test -- app/api/solar-history/route.test.ts`
Expected: PASS.

- [ ] **Step 9: Verify & commit**

Run: `npm test && npx tsc --noEmit && npm run lint` → commit.

---

### Task 4: Instellingen — Tarieven-kaart met modus-toggle + i18n

**Files:**
- Modify: `app/settings/page.tsx` (`TariffsCard` herschreven)
- Modify: `lib/i18n.ts`
- Test: `app/settings/page.test.tsx` (bestaand — werk de tarief-test bij + voeg toe)

**Interfaces:**
- Consumes: `/api/settings` PUT met het volledige `tariff`-object (Task 1); i18n-strings.

- [ ] **Step 1: Werk de i18n-strings bij/uit**

In `lib/i18n.ts`, wijzig de waarde van `tariff.import`: en → `"Consumption price"`, nl → `"Afnametarief"`. Voeg toe aan `en`:

```typescript
  "tariff.mode.simple": "Simple",
  "tariff.mode.advanced": "Advanced",
  "tariff.importLow": "Off-peak price",
  "tariff.importHigh": "Peak price",
  "tariff.feedIn": "Feed-in rate (surplus)",
  "tariff.fixedFeedIn": "Fixed feed-in cost/day",
  "tariff.salderingNote": "While net metering applies (until 2026) your real benefit is higher; from 2027 this matches exactly.",
```

En aan `nl`:

```typescript
  "tariff.mode.simple": "Eenvoudig",
  "tariff.mode.advanced": "Geavanceerd",
  "tariff.importLow": "Afname dal",
  "tariff.importHigh": "Afname normaal",
  "tariff.feedIn": "Terugleververgoeding (overschot)",
  "tariff.fixedFeedIn": "Vaste terugleverkosten/dag",
  "tariff.salderingNote": "Tijdens saldering (t/m 2026) ligt je werkelijke voordeel hoger; vanaf 2027 klopt dit precies.",
```

- [ ] **Step 2: Werk de settings-test bij (falend)**

In `app/settings/page.test.tsx`: de bestaande tarief-test stuurt `{ tariff: { importPrice } }` — pas die aan op de volledige vorm en voeg een toggle/advanced-test toe. Vervang de v1 tarief-test door:

```typescript
it("saves the consumption (afname) price in simple mode", async () => {
  render(wrap(<SettingsPage />));
  const input = await screen.findByLabelText(/Consumption price/i);
  fireEvent.change(input, { target: { value: "0,25" } });
  fireEvent.blur(input);
  await waitFor(() => {
    const put = fetchMock.mock.calls.find((c) => c[0] === "/api/settings" && c[1]?.method === "PUT" && JSON.parse(c[1].body).tariff);
    expect(put).toBeTruthy();
    const tariff = JSON.parse(put![1].body).tariff;
    expect(tariff.mode).toBe("simple");
    expect(tariff.importPrice).toBe(0.25);
  });
});

it("switches to advanced mode and saves a dual-tariff field", async () => {
  render(wrap(<SettingsPage />));
  fireEvent.click(await screen.findByRole("radio", { name: "Advanced" }));
  const low = await screen.findByLabelText(/Off-peak price/i);
  fireEvent.change(low, { target: { value: "0,22216" } });
  fireEvent.blur(low);
  await waitFor(() => {
    const put = fetchMock.mock.calls.find((c) => c[0] === "/api/settings" && c[1]?.method === "PUT" && JSON.parse(c[1].body).tariff?.mode === "advanced");
    expect(put).toBeTruthy();
    expect(JSON.parse(put![1].body).tariff.importLow).toBe(0.22216);
  });
});
```

- [ ] **Step 3: Run test → verwacht FAIL**

Run: `npm test -- app/settings/page.test.tsx`
Expected: FAIL — geen modus-toggle / advanced velden.

- [ ] **Step 4: Herschrijf `TariffsCard`**

In `app/settings/page.tsx`, vervang de bestaande `TariffsCard` (behoud `parsePrice` en `TariffInput` uit v1) door:

```tsx
type TariffState = {
  mode: "simple" | "advanced";
  importPrice: string; exportPrice: string;
  importLow: string; importHigh: string; feedInPrice: string; fixedFeedInPerDay: string;
};
const numToStr = (n: number | null | undefined) => (n != null ? String(n).replace(".", ",") : "");

/** Manual electricity tariffs (simple flat or advanced dual-tariff) that power
 *  the Solar widget's cost/earnings row. */
function TariffsCard() {
  const t = useT();
  const [s, setS] = useState<TariffState>({ mode: "simple", importPrice: "", exportPrice: "", importLow: "", importHigh: "", feedInPrice: "", fixedFeedInPerDay: "" });
  const mounted = useRef(true);
  useEffect(() => () => { mounted.current = false; }, []);
  useEffect(() => {
    let alive = true;
    fetch("/api/settings")
      .then((r) => r.json())
      .then((d: { tariff?: Partial<Record<keyof TariffState, number | null>> & { mode?: "simple" | "advanced" } }) => {
        if (!alive || !d.tariff) return;
        const tr = d.tariff;
        setS({
          mode: tr.mode === "advanced" ? "advanced" : "simple",
          importPrice: numToStr(tr.importPrice), exportPrice: numToStr(tr.exportPrice),
          importLow: numToStr(tr.importLow), importHigh: numToStr(tr.importHigh),
          feedInPrice: numToStr(tr.feedInPrice), fixedFeedInPerDay: numToStr(tr.fixedFeedInPerDay),
        });
      })
      .catch(() => {});
    return () => { alive = false; };
  }, []);

  function persist(next: TariffState) {
    fetch("/api/settings", {
      method: "PUT", headers: { "Content-Type": "application/json" }, keepalive: true,
      body: JSON.stringify({ tariff: {
        mode: next.mode,
        importPrice: parsePrice(next.importPrice), exportPrice: parsePrice(next.exportPrice),
        importLow: parsePrice(next.importLow), importHigh: parsePrice(next.importHigh),
        feedInPrice: parsePrice(next.feedInPrice), fixedFeedInPerDay: parsePrice(next.fixedFeedInPerDay),
      } }),
    })
      .then((r) => { if (mounted.current) { if (r.ok) toast.success(t("settings.saved")); else toast.error(t("settings.saveError")); } })
      .catch(() => { if (mounted.current) toast.error(t("settings.saveError")); });
  }
  const set = (patch: Partial<TariffState>) => setS((cur) => ({ ...cur, ...patch }));
  const commit = (patch: Partial<TariffState>) => { const next = { ...s, ...patch }; setS(next); persist(next); };

  return (
    <Card aria-label={t("settings.tariffs")}>
      <h2 className="text-lg font-semibold tracking-tight">{t("settings.tariffs")}</h2>
      <div className="mt-3">
        <Segmented
          label={t("settings.tariffs")}
          value={s.mode}
          onChange={(v) => commit({ mode: v })}
          options={[
            { value: "simple", label: t("tariff.mode.simple") },
            { value: "advanced", label: t("tariff.mode.advanced") },
          ]}
        />
      </div>
      <div className="mt-4 flex flex-col gap-3">
        {s.mode === "simple" ? (
          <>
            <TariffInput label={t("tariff.import")} value={s.importPrice} onChange={(v) => set({ importPrice: v })} onCommit={(v) => commit({ importPrice: v })} />
            <TariffInput label={t("tariff.export")} value={s.exportPrice} onChange={(v) => set({ exportPrice: v })} onCommit={(v) => commit({ exportPrice: v })} />
          </>
        ) : (
          <>
            <TariffInput label={t("tariff.importLow")} value={s.importLow} onChange={(v) => set({ importLow: v })} onCommit={(v) => commit({ importLow: v })} />
            <TariffInput label={t("tariff.importHigh")} value={s.importHigh} onChange={(v) => set({ importHigh: v })} onCommit={(v) => commit({ importHigh: v })} />
            <TariffInput label={t("tariff.feedIn")} value={s.feedInPrice} onChange={(v) => set({ feedInPrice: v })} onCommit={(v) => commit({ feedInPrice: v })} />
            <TariffInput label={t("tariff.fixedFeedIn")} value={s.fixedFeedInPerDay} onChange={(v) => set({ fixedFeedInPerDay: v })} onCommit={(v) => commit({ fixedFeedInPerDay: v })} />
            <p className="text-xs text-[var(--muted)]">{t("tariff.salderingNote")}</p>
          </>
        )}
      </div>
    </Card>
  );
}
```

(Verwijder de oude `tariff.hint`-paragraaf-afhankelijkheid niet; laat de bestaande `tariff.hint`-sleutel ongebruikt of verwijder hem — niet vereist.)

- [ ] **Step 5: Run test → verwacht PASS**

Run: `npm test -- app/settings/page.test.tsx`
Expected: PASS.

- [ ] **Step 6: Verify & commit**

Run: `npm test && npx tsc --noEmit && npm run lint` → commit.

- [ ] **Step 7: Handmatige rooktest**

Run: dev-server draait al (poort 3009) of `npm run dev`. In Instellingen: toggle Eenvoudig/Geavanceerd wisselt de velden; vul in geavanceerd dal 0,22216 / normaal 0,25514 / vergoeding 0,14 / vaste 0,28747. Op het home-scherm toont de Solar-widget per termijn een **realistische** Kosten/Opbrengst-rij (geen €0,00 meer).

---

## Self-Review

**1. Spec-dekking:**
- Eenheden-bug (kWh-native) → Task 2 (`periodDelta`, geen /1000) + Task 3 (route gebruikt het) + route-test die euro's verifieert. ✅
- Teruglever-baseline (2-dagen marge) → Task 3 (`MARGIN_MS`-venster). ✅
- Eenvoudig/geavanceerd toggle → Task 1 (model) + Task 4 (UI). ✅
- Dubbeltarief + salderings-bewuste teruglevering + vaste kosten → Task 3 (`computeTariffCost` advanced). ✅
- "Importprijs" → "Afnametarief" → Task 4 (i18n). ✅
- Backward-compat oude tarief → Task 1 (sanitize mode default). ✅
- Widget ongewijzigd → geen taak (kosten-rij bestaat al). ✅
- Buiten v2 (verlaagd tarief, jaarlijkse saldering) → niet ingepland. ✅

**2. Placeholder-scan:** Geen TBD/TODO; alle code-stappen bevatten volledige code. De route-test (Task 3) verifieert expliciet dat €-bedragen niet 1000× te laag zijn.

**3. Type-consistentie:** Uitgebreide `ElectricityTariff` (Task 1) ⇄ `computeTariffCost`/route (Task 3) ⇄ `TariffsCard` PUT (Task 4). `periodDelta` (Task 2) ⇄ route (Task 3). `PeriodEnergy`/`CostResult` (Task 3) intern consistent. `SolarCostSummary` (ongewijzigd) blijft de respons-vorm. ✅
