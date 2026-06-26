# Energiekosten in de Solar-widget — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Laat de gebruiker een vlak stroomtarief invullen in Instellingen, en toon per gekozen termijn de kosten van afgenomen energie en de opbrengst van teruglevering in de Solar-widget.

**Architecture:** Tarief in `AppSettings` (handmatig, persistent). `/api/solar-history` leest het tarief server-side; staat het ingevuld, dan haalt het de 4 cumulatieve metertellers erbij, berekent import/teruglever-kWh per termijn via het bestaande `energyBuckets`, en zet een `cost`-blok in de summary. De widget toont een Kosten/Opbrengst-rij wanneer `cost` aanwezig is.

**Tech Stack:** Next.js 16.2.9, React 19, TypeScript, Zod (settings-schema), Recharts (bestaand), Vitest + @testing-library/react.

## Global Constraints

- **Niet-standaard Next.js 16** (AGENTS.md): lees de relevante gids in `node_modules/next/dist/docs/` vóór route-/componentwijzigingen. Route-handler: `export async function GET(req: Request): Promise<Response>`, `export const dynamic = "force-dynamic"`.
- **HA-client is REST-only**; gebruik de bestaande `getHistory` (Task uit de vorige plan, al gemerged).
- **Geen nieuwe dependencies.**
- **nl-NL getalnotatie**: komma-decimaal; `—` (em-dash) voor `null`. Euro: `"€ 4,12"`.
- **i18n in twee talen**: elke nieuwe UI-string in zowel de `en`-const (bron van `MsgKey`) als de `nl`-record in `lib/i18n.ts`.
- **Tests**: Vitest, co-located `*.test.ts(x)`; component-tests met de `NL`-wrapper (LanguageProvider initial="nl") of bestaande wrappers; mock `fetch` via `vi.stubGlobal`.
- **Git**: repo is geïnitialiseerd, werk op branch `feat/solar-widget`. Na elke taak `npm test && npx tsc --noEmit && npm run lint` (er zijn PRE-EXISTING lint-fouten in ongerelateerde bestanden — zorg dat je eigen wijzigingen geen nieuwe lint-fouten geven), dan committen. Eindig de commit-body met:
  Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01BPUtdakJE9JBe1QUhtL51h
- **Tarief-entities (geverifieerd, cumulatief kWh):** consumption `sensor.electricity_meter_energy_consumption_tarif_1` + `_tarif_2`; production `sensor.electricity_meter_energy_production_tarif_1` + `_tarif_2`.

---

### Task 1: Fundament — types, config, settings-persistentie

**Files:**
- Modify: `lib/types.ts`
- Modify: `config/devices.ts`
- Modify: `lib/settings-store.ts`
- Modify: `app/api/settings/route.ts`
- Test: `lib/settings-store.test.ts` (bestaand — voeg cases toe)

**Interfaces:**
- Produces: `ElectricityTariff`, `AppSettings.tariff`, `SolarCostSummary`, `SolarHistoryResponse.summary.cost`; `GRID_METER`; tarief-sanitize/persistentie in de settings-store en het PUT-schema.

- [ ] **Step 1: Schrijf de falende test**

Voeg toe aan `lib/settings-store.test.ts` (gebruik de bestaande import van `getSettings`/`updateSettings`/`_resetSettingsCache` en de `SETTINGS_PATH`-aanpak die het bestand al hanteert; als het bestand een tmp-pad via `process.env.SETTINGS_PATH` zet, hergebruik dat):

```typescript
describe("tariff settings", () => {
  it("defaults tariff to nulls", () => {
    const s = getSettings();
    expect(s.tariff).toEqual({ importPrice: null, exportPrice: null });
  });
  it("persists valid non-negative prices", () => {
    const s = updateSettings({ tariff: { importPrice: 0.23, exportPrice: 0.08 } });
    expect(s.tariff).toEqual({ importPrice: 0.23, exportPrice: 0.08 });
    expect(getSettings().tariff).toEqual({ importPrice: 0.23, exportPrice: 0.08 });
  });
  it("coerces negative or non-numeric prices to null", () => {
    const s = updateSettings({ tariff: { importPrice: -1 as number, exportPrice: "x" as unknown as number } });
    expect(s.tariff).toEqual({ importPrice: null, exportPrice: null });
  });
});
```

- [ ] **Step 2: Run test → verwacht FAIL**

Run: `npm test -- lib/settings-store.test.ts`
Expected: FAIL — `s.tariff` is `undefined`.

- [ ] **Step 3: Voeg de types toe**

In `lib/types.ts`, naast de andere solar-types:

```typescript
export interface ElectricityTariff {
  importPrice: number | null;   // €/kWh betaald voor afgenomen energie
  exportPrice: number | null;   // €/kWh ontvangen voor teruglevering
}

export interface SolarCostSummary {
  importKwh: number | null;
  exportKwh: number | null;
  importCost: number | null;
  exportEarnings: number | null;
}
```

Breid `AppSettings` uit met:

```typescript
  /** Handmatig stroomtarief voor de kosten-weergave in de Solar-widget. */
  tariff: ElectricityTariff;
```

Breid `SolarHistoryResponse.summary` uit van `{ producedKwh: number | null }` naar:

```typescript
  summary: { producedKwh: number | null; cost: SolarCostSummary | null };
```

- [ ] **Step 4: Voeg de GRID_METER-config toe**

In `config/devices.ts`, onder `SOLAR`:

```typescript
/** Cumulatieve P1-metertellers (kWh) voor de kosten-berekening. */
export const GRID_METER = {
  importT1: "sensor.electricity_meter_energy_consumption_tarif_1",
  importT2: "sensor.electricity_meter_energy_consumption_tarif_2",
  exportT1: "sensor.electricity_meter_energy_production_tarif_1",
  exportT2: "sensor.electricity_meter_energy_production_tarif_2",
} as const;
```

- [ ] **Step 5: Tarief in de settings-store**

In `lib/settings-store.ts`:

Voeg een prijs-validator toe (boven `sanitize`):

```typescript
function validPrice(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : null;
}
```

Breid `defaults()` uit:

```typescript
function defaults(): AppSettings {
  return { language: "en", theme: "system", favorites: {}, waterAlert: true, hiddenMetrics: {}, cardOrder: [], tariff: { importPrice: null, exportPrice: null } };
}
```

Voeg in `sanitize()` vóór `return out;` toe:

```typescript
  if (r.tariff && typeof r.tariff === "object" && !Array.isArray(r.tariff)) {
    const tr = r.tariff as Record<string, unknown>;
    out.tariff = { importPrice: validPrice(tr.importPrice), exportPrice: validPrice(tr.exportPrice) };
  }
```

Voeg in `updateSettings()` aan het object dat aan `sanitize` wordt doorgegeven toe:

```typescript
    cardOrder: patch.cardOrder ?? current.cardOrder,
    tariff: patch.tariff ?? current.tariff,
```

- [ ] **Step 6: Tarief in het PUT-schema**

In `app/api/settings/route.ts`, voeg aan `patchSchema` toe:

```typescript
  tariff: z
    .object({
      importPrice: z.number().nonnegative().nullable(),
      exportPrice: z.number().nonnegative().nullable(),
    })
    .optional(),
```

- [ ] **Step 7: Run test → verwacht PASS**

Run: `npm test -- lib/settings-store.test.ts`
Expected: PASS.

- [ ] **Step 8: Repareer AppSettings-fixtures en verifieer types**

Run: `npx tsc --noEmit`
Voor elke fout "Property 'tariff' is missing in type ... AppSettings", voeg toe:

```typescript
tariff: { importPrice: null, exportPrice: null },
```

Voor elke fout over `summary` die `cost` mist (bestaande `/api/solar-history`-respons-literals), voeg `cost: null` toe aan dat summary-object. Herhaal tot `npx tsc --noEmit` schoon is.

- [ ] **Step 9: Verify & commit**

Run: `npm test && npx tsc --noEmit && npm run lint`
Commit.

---

### Task 2: Pure rekenlogica — `tariffCost` + `formatEuro`

**Files:**
- Create: `lib/solar-cost.ts`
- Modify: `lib/metrics.ts`
- Test: `lib/solar-cost.test.ts`, `lib/metrics.test.ts`

**Interfaces:**
- Consumes: `ElectricityTariff` (Task 1).
- Produces: `tariffCost(importKwh, exportKwh, tariff): { importCost: number|null; exportEarnings: number|null }`; `formatEuro(value: number|null): string`.

- [ ] **Step 1: Schrijf de falende tests**

Maak `lib/solar-cost.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { tariffCost } from "@/lib/solar-cost";

describe("tariffCost", () => {
  it("multiplies kWh by price, rounded to cents", () => {
    expect(tariffCost(17.8, 22.5, { importPrice: 0.23, exportPrice: 0.08 })).toEqual({
      importCost: 4.09, exportEarnings: 1.8,
    });
  });
  it("returns null for a side whose price is null", () => {
    expect(tariffCost(10, 10, { importPrice: 0.23, exportPrice: null })).toEqual({
      importCost: 2.3, exportEarnings: null,
    });
  });
  it("returns null for a side whose kWh is null", () => {
    expect(tariffCost(null, 5, { importPrice: 0.23, exportPrice: 0.08 })).toEqual({
      importCost: null, exportEarnings: 0.4,
    });
  });
});
```

Voeg toe aan `lib/metrics.test.ts`:

```typescript
import { formatEuro } from "@/lib/metrics";

describe("formatEuro", () => {
  it("formats euros with a NL comma and two decimals", () => {
    expect(formatEuro(4.1)).toBe("€ 4,10");
    expect(formatEuro(0)).toBe("€ 0,00");
  });
  it("returns an em dash for null", () => {
    expect(formatEuro(null)).toBe("—");
  });
});
```

- [ ] **Step 2: Run tests → verwacht FAIL**

Run: `npm test -- lib/solar-cost.test.ts lib/metrics.test.ts`
Expected: FAIL — `tariffCost`/`formatEuro` bestaan niet.

- [ ] **Step 3: Implementeer `lib/solar-cost.ts`**

```typescript
import type { ElectricityTariff } from "@/lib/types";

/** Kosten (afname) en opbrengst (teruglevering) over een termijn; null waar kWh
 *  of prijs ontbreekt. Afgerond op centen. */
export function tariffCost(
  importKwh: number | null,
  exportKwh: number | null,
  tariff: ElectricityTariff,
): { importCost: number | null; exportEarnings: number | null } {
  const importCost =
    importKwh != null && tariff.importPrice != null
      ? Math.round(importKwh * tariff.importPrice * 100) / 100
      : null;
  const exportEarnings =
    exportKwh != null && tariff.exportPrice != null
      ? Math.round(exportKwh * tariff.exportPrice * 100) / 100
      : null;
  return { importCost, exportEarnings };
}
```

- [ ] **Step 4: Implementeer `formatEuro`**

Voeg toe aan `lib/metrics.ts`:

```typescript
/** Euro-bedrag in nl-NL ("€ 4,12"); "—" bij null. */
export function formatEuro(value: number | null): string {
  if (value == null) return "—";
  return `€ ${value.toFixed(2).replace(".", ",")}`;
}
```

- [ ] **Step 5: Run tests → verwacht PASS**

Run: `npm test -- lib/solar-cost.test.ts lib/metrics.test.ts`
Expected: PASS.

- [ ] **Step 6: Verify & commit**

Run: `npm test && npx tsc --noEmit && npm run lint`
Commit.

---

### Task 3: Kosten-pad in `/api/solar-history`

**Files:**
- Modify: `app/api/solar-history/route.ts`
- Test: `app/api/solar-history/route.test.ts` (bestaand — voeg cases toe; mock `@/lib/settings-store`)

**Interfaces:**
- Consumes: `getHistory`, `statusForError` (ha-client); `SOLAR`, `GRID_METER` (devices); `parseHistory`, `energyBuckets`, `dayBoundaries`, `monthBoundaries`, `downsamplePower`, `sumKwh` (solar-history); `tariffCost` (Task 2); `getSettings` (settings-store); types.
- Produces: `summary.cost` gevuld wanneer een tarief is ingesteld, anders `null`.

- [ ] **Step 1: Lees de Next.js route-conventie** (zie Global Constraints) en bekijk de huidige `route.ts`.

- [ ] **Step 2: Schrijf de falende test**

Het bestaande testbestand mockt `@/lib/ha-client` en gebruikt `vi.setSystemTime`. Voeg een settings-mock toe en kosten-cases. Voeg bovenaan, naast de bestaande `vi.mock("@/lib/ha-client", ...)`:

```typescript
vi.mock("@/lib/settings-store", () => ({ getSettings: vi.fn() }));
import { getSettings } from "@/lib/settings-store";
const mockSettings = getSettings as unknown as ReturnType<typeof vi.fn>;
```

In `beforeEach`, na de bestaande mock-reset, default het tarief op leeg:

```typescript
  mockSettings.mockReturnValue({ tariff: { importPrice: null, exportPrice: null } });
```

Voeg deze cases toe (gebruik een entity-id-gestuurde mockImplementation zodat de volgorde van calls niet uitmaakt):

```typescript
it("omits cost (null) when no tariff is set", async () => {
  mockHistory.mockResolvedValue([]); // any range; no tariff
  const res = await GET(req("week"));
  const body = await res.json();
  expect(body.summary.cost).toBeNull();
});

it("computes cost and earnings when a tariff is set", async () => {
  mockSettings.mockReturnValue({ tariff: { importPrice: 0.23, exportPrice: 0.08 } });
  // Lifetime/meter histories keyed by entity id; week range start..now deltas:
  const series = (start: string, end: string) => [
    { state: start, last_changed: "2026-06-18T00:00:00Z" },
    { state: end, last_changed: "2026-06-25T00:00:00Z" },
  ];
  mockHistory.mockImplementation((id: string) => {
    if (id === "sensor.solaredge_lifetime_energy") return Promise.resolve(series("0", "7000"));
    if (id === "sensor.electricity_meter_energy_consumption_tarif_1") return Promise.resolve(series("0", "5000"));   // +5 kWh
    if (id === "sensor.electricity_meter_energy_consumption_tarif_2") return Promise.resolve(series("0", "5000"));   // +5 kWh -> import 10
    if (id === "sensor.electricity_meter_energy_production_tarif_1") return Promise.resolve(series("0", "2000"));    // +2 kWh
    if (id === "sensor.electricity_meter_energy_production_tarif_2") return Promise.resolve(series("0", "3000"));    // +3 kWh -> export 5
    return Promise.resolve([]);
  });
  const res = await GET(req("week"));
  const body = await res.json();
  expect(body.summary.cost.importKwh).toBe(10);
  expect(body.summary.cost.exportKwh).toBe(5);
  expect(body.summary.cost.importCost).toBe(2.3);     // 10 * 0.23
  expect(body.summary.cost.exportEarnings).toBe(0.4); // 5 * 0.08
});

it("returns cost null (not a throw) when the meter history fails", async () => {
  mockSettings.mockReturnValue({ tariff: { importPrice: 0.23, exportPrice: 0.08 } });
  mockHistory.mockImplementation((id: string) => {
    if (id.startsWith("sensor.electricity_meter")) return Promise.reject(new Error("boom"));
    return Promise.resolve([]);
  });
  const res = await GET(req("week"));
  const body = await res.json();
  expect(res.status).toBe(200);
  expect(body.summary.cost).toBeNull();
});
```

> NB: bestaande cases die `body.summary.producedKwh` checken blijven werken; voeg waar nodig `cost: null` toe aan hun verwachtingen alleen als ze het hele `summary`-object vergelijken (de meeste checken losse velden).

- [ ] **Step 3: Run test → verwacht FAIL**

Run: `npm test -- app/api/solar-history/route.test.ts`
Expected: FAIL — `summary.cost` bestaat niet.

- [ ] **Step 4: Implementeer het kosten-pad**

In `app/api/solar-history/route.ts`:

Voeg imports toe:

```typescript
import { SOLAR, GRID_METER } from "@/config/devices";
import { tariffCost } from "@/lib/solar-cost";
import { getSettings } from "@/lib/settings-store";
import type { SolarRange, SolarHistoryResponse, ElectricityTariff } from "@/lib/types";
```

Voeg de kosten-helper toe (onder `bucketsFor`):

```typescript
async function computeCost(
  start: number,
  now: number,
  tariff: ElectricityTariff,
  iso: (ms: number) => string,
): Promise<SolarHistoryResponse["summary"]["cost"]> {
  if (tariff.importPrice == null && tariff.exportPrice == null) return null;
  try {
    const [it1, it2, et1, et2] = await Promise.all([
      getHistory(GRID_METER.importT1, iso(start), iso(now)),
      getHistory(GRID_METER.importT2, iso(start), iso(now)),
      getHistory(GRID_METER.exportT1, iso(start), iso(now)),
      getHistory(GRID_METER.exportT2, iso(start), iso(now)),
    ]);
    const delta = (raw: { state: string; last_changed: string }[]) =>
      energyBuckets(parseHistory(raw), [start, now])[0]?.value ?? null;
    const i1 = delta(it1), i2 = delta(it2), e1 = delta(et1), e2 = delta(et2);
    const importKwh = i1 != null && i2 != null ? Math.round((i1 + i2) * 100) / 100 : null;
    const exportKwh = e1 != null && e2 != null ? Math.round((e1 + e2) * 100) / 100 : null;
    const { importCost, exportEarnings } = tariffCost(importKwh, exportKwh, tariff);
    return { importKwh, exportKwh, importCost, exportEarnings };
  } catch {
    return null;
  }
}
```

Lees het tarief bovenin `GET` (na `const now = Date.now();`):

```typescript
  const tariff = getSettings().tariff;
```

In de `today`-tak, vervang de return door:

```typescript
      const cost = await computeCost(start, now, tariff, iso);
      const body: SolarHistoryResponse = {
        range: r, chartType: "power", unit: "W", points,
        summary: { producedKwh: today[0]?.value ?? null, cost },
      };
      return Response.json(body);
```

In de range-tak, vervang de return door:

```typescript
      const cost = await computeCost(boundaries[0], now, tariff, iso);
      const body: SolarHistoryResponse = {
        range: r, chartType: "energy", unit: "kWh", points,
        summary: { producedKwh: sumKwh(points), cost },
      };
      return Response.json(body);
```

In de `catch`-tak, voeg `cost: null` toe aan de lege summary:

```typescript
      summary: { producedKwh: null, cost: null },
```

- [ ] **Step 5: Run test → verwacht PASS**

Run: `npm test -- app/api/solar-history/route.test.ts`
Expected: PASS (alle cases, incl. bestaande).

- [ ] **Step 6: Verify & commit**

Run: `npm test && npx tsc --noEmit && npm run lint`
Commit.

---

### Task 4: Kosten-rij in `SolarCard` + widget-i18n

**Files:**
- Modify: `app/components/SolarCard.tsx`
- Modify: `lib/i18n.ts`
- Test: `app/components/SolarCard.test.tsx` (bestaand — voeg cases toe)

**Interfaces:**
- Consumes: `SolarCostSummary` (Task 1), `formatEuro` (Task 2), `summary.cost` uit `/api/solar-history` (Task 3).

- [ ] **Step 1: Voeg de i18n-strings toe**

In `lib/i18n.ts`, aan de `en`-const: `"solar.cost": "Cost",` en `"solar.earnings": "Earnings",`. Aan de `nl`-record: `"solar.cost": "Kosten",` en `"solar.earnings": "Opbrengst",`.

- [ ] **Step 2: Schrijf de falende test**

Voeg toe aan `app/components/SolarCard.test.tsx`:

```typescript
it("shows a cost/earnings row when the response includes cost", async () => {
  fetchMock.mockImplementation(() => Promise.resolve({
    ok: true,
    json: () => Promise.resolve({
      range: "today", chartType: "power", unit: "W", points: [],
      summary: { producedKwh: 18.4, cost: { importKwh: 10, exportKwh: 5, importCost: 2.3, exportEarnings: 0.4 } },
    }),
  }));
  render(<SolarCard solar={solar} />);
  await waitFor(() => expect(screen.getByText("Kosten")).toBeInTheDocument());
  expect(screen.getByText("€ 2,30")).toBeInTheDocument();
  expect(screen.getByText("Opbrengst")).toBeInTheDocument();
  expect(screen.getByText("€ 0,40")).toBeInTheDocument();
});

it("hides the cost row when cost is null", async () => {
  render(<SolarCard solar={solar} />); // default mock returns cost-less summary
  await waitFor(() => expect(screen.getByText("18,4 kWh")).toBeInTheDocument());
  expect(screen.queryByText("Kosten")).not.toBeInTheDocument();
});
```

> Zorg dat de bestaande `beforeEach`-fetchmock een summary zonder `cost` (of `cost: null`) teruggeeft, zodat de "hides" case klopt. Als de bestaande mock al `summary: { producedKwh: 18.4 }` teruggeeft, voeg daar `cost: null` aan toe.

- [ ] **Step 3: Run test → verwacht FAIL**

Run: `npm test -- app/components/SolarCard.test.tsx`
Expected: FAIL — geen "Kosten" in beeld.

- [ ] **Step 4: Implementeer de kosten-rij**

In `app/components/SolarCard.tsx`:

Breid de import uit: `import { formatKw, formatKwh, formatPercent, wattsToKw, formatEuro } from "@/lib/metrics";` en voeg `SolarCostSummary` toe aan de type-import uit `@/lib/types`.

Breid `HistoryState` en `EMPTY` uit:

```typescript
type HistoryState = {
  chartType: "power" | "energy";
  points: SolarHistoryPoint[];
  producedKwh: number | null;
  cost: SolarCostSummary | null;
};
const EMPTY: HistoryState = { chartType: "power", points: [], producedKwh: null, cost: null };
```

In de fetch-`.then`, neem `cost` mee:

```typescript
        setHist({ chartType: d.chartType, points: d.points ?? [], producedKwh: d.summary?.producedKwh ?? null, cost: d.summary?.cost ?? null });
```

Voeg ná de bestaande drie-stat-rij (de `<div className="mt-4 flex gap-2">…</div>`) toe:

```tsx
      {hist.cost && (hist.cost.importCost != null || hist.cost.exportEarnings != null) && (
        <div className="mt-2 flex gap-2">
          <Stat k={t("solar.cost")} v={formatEuro(hist.cost.importCost)} />
          <Stat k={t("solar.earnings")} v={formatEuro(hist.cost.exportEarnings)} color="var(--accent-cool)" />
        </div>
      )}
```

- [ ] **Step 5: Run test → verwacht PASS**

Run: `npm test -- app/components/SolarCard.test.tsx`
Expected: PASS.

- [ ] **Step 6: Verify & commit**

Run: `npm test && npx tsc --noEmit && npm run lint`
Commit.

---

### Task 5: Tarieven-kaart in Instellingen + settings-i18n

**Files:**
- Modify: `app/settings/page.tsx`
- Modify: `lib/i18n.ts`
- Test: `app/settings/page.test.tsx` (bestaand — voeg een case toe)

**Interfaces:**
- Consumes: `/api/settings` PUT met `{ tariff }` (Task 1), i18n-strings.

- [ ] **Step 1: Voeg de i18n-strings toe**

In `lib/i18n.ts`, aan `en`:

```typescript
  "settings.tariffs": "Tariffs",
  "tariff.import": "Import price",
  "tariff.export": "Feed-in price",
  "tariff.hint": "Check your energy bill (€/kWh).",
  "tariff.unit": "€/kWh",
```

Aan `nl`:

```typescript
  "settings.tariffs": "Tarieven",
  "tariff.import": "Importprijs",
  "tariff.export": "Teruglevering",
  "tariff.hint": "Kijk op je energierekening (€/kWh).",
  "tariff.unit": "€/kWh",
```

- [ ] **Step 2: Schrijf de falende test**

Voeg toe aan `app/settings/page.test.tsx` (binnen `describe("SettingsPage", …)`, hergebruik de bestaande `wrap`/`fetchMock`/`fetchImpl`; let op: de wrapper is Engels):

```typescript
it("saves a tariff when the import price is entered", async () => {
  render(wrap(<SettingsPage />));
  const input = await screen.findByLabelText(/Import price/i);
  fireEvent.change(input, { target: { value: "0,23" } });
  fireEvent.blur(input);
  await waitFor(() => {
    const put = fetchMock.mock.calls.find(
      (c) => c[0] === "/api/settings" && c[1]?.method === "PUT" && JSON.parse(c[1].body).tariff,
    );
    expect(put).toBeTruthy();
    expect(JSON.parse(put![1].body).tariff.importPrice).toBe(0.23);
  });
});
```

- [ ] **Step 3: Run test → verwacht FAIL**

Run: `npm test -- app/settings/page.test.tsx`
Expected: FAIL — geen "Import price"-veld.

- [ ] **Step 4: Implementeer de Tarieven-kaart**

In `app/settings/page.tsx`, voeg vóór `export default function SettingsPage()` deze twee componenten + helper toe:

```tsx
/** Parse a "0,23" / "0.23" tariff string to a non-negative number, or null. */
function parsePrice(s: string): number | null {
  const n = Number(s.replace(",", ".").trim());
  return s.trim() !== "" && Number.isFinite(n) && n >= 0 ? Math.round(n * 1000) / 1000 : null;
}

function TariffInput({ label, value, onChange, onCommit }: { label: string; value: string; onChange: (v: string) => void; onCommit: (v: string) => void }) {
  const t = useT();
  return (
    <label className="flex items-center justify-between gap-3">
      <span className="text-sm font-medium">{label}</span>
      <span className="flex items-center gap-1.5">
        <input
          inputMode="decimal"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onBlur={(e) => onCommit(e.target.value)}
          placeholder="0,00"
          className="w-20 rounded-lg border border-[var(--card-border)] bg-[var(--card)] px-2.5 py-2 text-right text-sm tabular-nums outline-none focus:border-[var(--ring)]"
        />
        <span className="text-xs text-[var(--muted)]">{t("tariff.unit")}</span>
      </span>
    </label>
  );
}

/** Manual electricity tariffs that power the Solar widget's cost/earnings row. */
function TariffsCard() {
  const t = useT();
  const [imp, setImp] = useState("");
  const [exp, setExp] = useState("");
  const mounted = useRef(true);
  useEffect(() => () => { mounted.current = false; }, []);
  useEffect(() => {
    let alive = true;
    fetch("/api/settings")
      .then((r) => r.json())
      .then((s: { tariff?: { importPrice: number | null; exportPrice: number | null } }) => {
        if (!alive) return;
        setImp(s.tariff?.importPrice != null ? String(s.tariff.importPrice).replace(".", ",") : "");
        setExp(s.tariff?.exportPrice != null ? String(s.tariff.exportPrice).replace(".", ",") : "");
      })
      .catch(() => {});
    return () => { alive = false; };
  }, []);

  function save(nextImp: string, nextExp: string) {
    fetch("/api/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tariff: { importPrice: parsePrice(nextImp), exportPrice: parsePrice(nextExp) } }),
      keepalive: true,
    })
      .then((r) => { if (mounted.current) { if (r.ok) toast.success(t("settings.saved")); else toast.error(t("settings.saveError")); } })
      .catch(() => { if (mounted.current) toast.error(t("settings.saveError")); });
  }

  return (
    <Card aria-label={t("settings.tariffs")}>
      <h2 className="text-lg font-semibold tracking-tight">{t("settings.tariffs")}</h2>
      <p className="mt-1 text-sm text-[var(--muted)]">{t("tariff.hint")}</p>
      <div className="mt-3 flex flex-col gap-3">
        <TariffInput label={t("tariff.import")} value={imp} onChange={setImp} onCommit={(v) => save(v, exp)} />
        <TariffInput label={t("tariff.export")} value={exp} onChange={setExp} onCommit={(v) => save(imp, v)} />
      </div>
    </Card>
  );
}
```

Render `<TariffsCard />` in `SettingsPage` direct na `<NotificationsCard />`:

```tsx
      <NotificationsCard />

      <TariffsCard />
```

- [ ] **Step 5: Run test → verwacht PASS**

Run: `npm test -- app/settings/page.test.tsx`
Expected: PASS.

- [ ] **Step 6: Verify & commit**

Run: `npm test && npx tsc --noEmit && npm run lint`
Commit.

- [ ] **Step 7: Handmatige rooktest**

Run: `npm run dev`. In Instellingen verschijnt een **Tarieven**-kaart; vul 0,23 (import) en 0,08 (teruglevering) in. Op het home-scherm toont de Solar-widget onder de stats een **Kosten / Opbrengst**-rij per gekozen termijn. Leeg de velden → de rij verdwijnt.

---

## Self-Review

**1. Spec-dekking:**
- Tarief in settings (handmatig, persistent) → Task 1 (types/store/route) + Task 5 (UI). ✅
- Kosten/opbrengst per termijn uit de 4 metertellers → Task 3 (`computeCost`) + Task 2 (`tariffCost`). ✅
- `cost` in summary, `null` zonder tarief → Task 1 (type) + Task 3 (route). ✅
- Widget toont rij alleen bij tarief → Task 4. ✅
- nl-NL euro + i18n → Task 2 (`formatEuro`) + Tasks 4/5 (strings). ✅
- Randgevallen (geen tarief, teller-fout, teller null, negatieve delta, ongeldige invoer) → Task 3 (cost null / one-null → null), Task 1 (sanitize/validPrice), Task 5 (parsePrice). ✅
- Buiten v1 (dag/nacht, live HA-prijs, kosten in grafiek) → niet ingepland. ✅

**2. Placeholder-scan:** Geen TBD/TODO; alle code-stappen bevatten volledige code. De settings-store test (Task 1 Step 1) hergebruikt het bestaande `SETTINGS_PATH`-patroon — de implementer moet dat in het bestaande testbestand volgen (expliciet benoemd).

**3. Type-consistentie:** `ElectricityTariff`/`SolarCostSummary`/`summary.cost` (Task 1) consistent geconsumeerd in Tasks 2/3/4. `tariffCost`-signatuur (Task 2) ⇄ aanroep in Task 3. `GRID_METER`-keys (Task 1) ⇄ Task 3. `formatEuro` (Task 2) ⇄ Task 4. `/api/settings` PUT `{ tariff }` (Task 1) ⇄ Task 5. ✅
