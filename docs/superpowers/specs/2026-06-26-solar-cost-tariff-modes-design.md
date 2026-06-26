# Ontwerp: Tarieven v2 — eenvoudig/geavanceerd + kostenbugfixes

**Datum:** 2026-06-26
**Status:** Goedgekeurd (ontwerp) — klaar voor implementatieplan
**Vervangt/breidt uit:** `2026-06-26-solar-energy-cost-design.md` (v1)

## Aanleiding

De v1 kosten-feature gaf op de live HA verkeerde bedragen:
1. **Eenheden-bug:** de slimme-meter tellers staan in **kWh**, maar `computeCost`
   hergebruikte `energyBuckets`, dat door 1000 deelt (de SolarEdge-teller is in **Wh**).
   Alle kosten kwamen ~1000× te laag uit (€0,02 i.p.v. ~€11/week). De v1 unit-test
   maskeerde dit met Wh-schaal fixtures.
2. **Teruglever-baseline:** de teruglever-tellers loggen niet exact op de
   periodegrens (eerste meting bv. 06:59 i.p.v. 00:00), waardoor de beginstand
   `lifetimeAt(rangeStart)` null is en `exportKwh` → null ("—").

Daarnaast: de term "Importprijs" past niet, en het echte contract is een
**dubbeltarief** met salderingsnuance. Daarom een v2 met een eenvoudig/geavanceerd-toggle.

## Beslissingen (door gebruiker bevestigd)

- **Toggle Eenvoudig / Geavanceerd** in Instellingen.
- **Geavanceerd = dubbeltarief** (dal `tarif_1` + normaal `tarif_2`).
- **Teruglevering geavanceerd = salderings-bewust** (per-termijn benadering): gesaldeerd
  deel tegen de **afnameprijs**, overschot tegen de **terugleververgoeding**, minus
  **vaste terugleverkosten/dag**.
- "Importprijs" → **"Afnametarief"** / **"Afname"**.

## Niet-doelen (YAGNI voor v2)

- Apart "verlaagd" terugleververgoeding-tarief (€0,03) als los veld.
- Volledige **jaarlijkse** salderingsverrekening (we benaderen per termijn).
- Enkeltarief als aparte modus (eenvoudig dekt dat met één prijs).

## Datamodel

```ts
// lib/types.ts — ElectricityTariff uitgebreid (backward-compatible)
export type TariffMode = "simple" | "advanced";

export interface ElectricityTariff {
  mode: TariffMode;
  // eenvoudig
  importPrice: number | null;       // afnameprijs €/kWh
  exportPrice: number | null;       // terugleverprijs €/kWh
  // geavanceerd
  importLow: number | null;         // afname dal (tarif_1) €/kWh
  importHigh: number | null;        // afname normaal (tarif_2) €/kWh
  feedInPrice: number | null;       // terugleververgoeding (overschot) €/kWh
  fixedFeedInPerDay: number | null; // vaste terugleverkosten €/dag
}
```

Default: `{ mode: "simple", importPrice: null, exportPrice: null, importLow: null, importHigh: null, feedInPrice: null, fixedFeedInPerDay: null }`.

**Backward compat:** oude opgeslagen `{ importPrice, exportPrice }` blijft geldig; `sanitize`
zet ontbrekende `mode` op `"simple"` en ontbrekende velden op `null`.

`SolarCostSummary` (de API-respons) blijft ongewijzigd:
`{ importKwh, exportKwh, importCost, exportEarnings: number | null }`.

## Berekening

### Periode-energie per tarief (in de route, kWh-native — FIX eenheden)

Voor elk van de 4 `GRID_METER`-tellers de **clamped delta** over `[rangeStart, now]`
in de **eigen eenheid (kWh)** — dus NIET door 1000 delen:

```ts
// lib/solar-history.ts — nieuw, naast energyBuckets
export function periodDelta(points: RawPoint[], start: number, end: number): number | null {
  const a = lifetimeAt(points, start);
  const b = lifetimeAt(points, end);
  return a != null && b != null ? Math.round(Math.max(0, b - a) * 1000) / 1000 : null;
}
```

Levert: `afnameLow` (importT1), `afnameHigh` (importT2), `terugLow` (exportT1),
`terugHigh` (exportT2) — allemaal in kWh.

### Baseline-marge (FIX teruglever-baseline)

De route haalt de meter-history op vanaf `rangeStart − 2 dagen` (`MARGIN_MS = 2*86400000`),
zodat `lifetimeAt(rangeStart)` altijd een eerdere meting vindt. De delta wordt nog steeds
over `[rangeStart, now]` berekend.

### Pure kostenlogica (`lib/solar-cost.ts` — herschreven)

```ts
export interface PeriodEnergy {
  afnameLow: number | null; afnameHigh: number | null;
  terugLow: number | null;  terugHigh: number | null;
}
export interface CostResult {
  importKwh: number | null; exportKwh: number | null;
  importCost: number | null; exportEarnings: number | null;
}
export function computeTariffCost(e: PeriodEnergy, t: ElectricityTariff, days: number): CostResult
```

**Totalen:**
- `importKwh = (afnameLow!=null && afnameHigh!=null) ? round2(afnameLow+afnameHigh) : null`
- `exportKwh = (terugLow!=null && terugHigh!=null) ? round2(terugLow+terugHigh) : null`

**Eenvoudig (`mode==="simple"`):**
- `importCost = importKwh!=null && importPrice!=null ? round2(importKwh*importPrice) : null`
- `exportEarnings = exportKwh!=null && exportPrice!=null ? round2(exportKwh*exportPrice) : null`

**Geavanceerd (`mode==="advanced"`, salderings-bewust):**
- `importCost = (afnameLow,afnameHigh,importLow,importHigh allemaal !=null) ? round2(afnameLow*importLow + afnameHigh*importHigh) : null`
- Per tarief t ∈ {low, high}, met `prijs_low=importLow`, `prijs_high=importHigh`:
  - `gesaldeerd_t = min(terug_t, afname_t) * prijs_t`
  - `overschot_t = max(0, terug_t - afname_t) * (feedInPrice ?? 0)`
- `exportEarnings = (afnameLow,afnameHigh,terugLow,terugHigh,importLow,importHigh allemaal !=null)`
  `? round2(gesaldeerd_low + gesaldeerd_high + overschot_low + overschot_high - days*(fixedFeedInPerDay ?? 0)) : null`
- `feedInPrice`/`fixedFeedInPerDay` zijn optioneel (default 0 als null).

`round2(x) = Math.round(x*100)/100`. `days = (now - rangeStart)/86400000` (fractioneel; door de route doorgegeven).

## API-wijziging `/api/solar-history`

`computeCost` wordt herschreven:
- Leest `getSettings().tariff` (uitgebreide vorm).
- Korte-sluiting wanneer er **geen bruikbaar tarief** is: voor `simple` als import+export
  beide null; voor `advanced` als alle geavanceerde velden null → `cost: null`.
- Anders: haal de 4 tellers op over `[rangeStart - MARGIN_MS, now]` (Promise.all),
  bereken `periodDelta(... , rangeStart, now)` per teller, bouw `PeriodEnergy`,
  roep `computeTariffCost(energy, tariff, days)` aan, zet het in `summary.cost`.
- Eigen try/catch → `cost: null` bij teller-fout (hoofdrespons blijft werken).

## Instellingen-UI (`TariffsCard` herschreven)

- **Segmented toggle** Eenvoudig / Geavanceerd (hergebruik de bestaande `Segmented`-component).
- **Eenvoudig:** twee velden — **Afnametarief**, **Teruglevering** (€/kWh).
- **Geavanceerd:** **Afname dal**, **Afname normaal**, **Terugleververgoeding**,
  **Vaste terugleverkosten/dag**, plus een muted **salderingsnotitie**.
- Opslaan: PUT `/api/settings` met het volledige `tariff`-object (mode + alle velden);
  komma-invoer → getal via `parsePrice`; leeg → null.

## Widget

De bestaande kosten-rij blijft: **Kosten** (`importCost`) + **Opbrengst** (`exportEarnings`),
zichtbaar wanneer `summary.cost` aanwezig is met minstens één niet-null bedrag. Geen
verdere widget-wijziging nodig (labels "Kosten"/"Opbrengst" blijven).

## i18n (NL / EN)

- Wijzig `tariff.import`: "Importprijs"/"Import price" → **"Afnametarief"/"Consumption price"**.
- Nieuw: `tariff.mode.simple` (Eenvoudig/Simple), `tariff.mode.advanced` (Geavanceerd/Advanced),
  `tariff.importLow` (Afname dal/Off-peak price), `tariff.importHigh` (Afname normaal/Peak price),
  `tariff.feedIn` (Terugleververgoeding/Feed-in rate), `tariff.fixedFeedIn` (Vaste terugleverkosten/dag /
  Fixed feed-in cost/day), `tariff.salderingNote` (de salderingsnotitie).

## Randgevallen

| Situatie | Gedrag |
|---|---|
| Geen bruikbaar tarief (per modus) | Geen kosten-rij; `cost: null` |
| Eén tarief-teller `null` op de grens (na marge) | Betreffend totaal `null` → "—" |
| Teller-fout (HA) | `cost: null`, hoofdrespons werkt door |
| Negatieve delta (reset) | Clamp 0 (in `periodDelta`) |
| Geavanceerd, overschot maar `feedInPrice` leeg | Overschot tegen €0 (default), gesaldeerd telt wel |
| Oude settings zonder `mode` | `mode="simple"`, import/export behouden |

## Tests

- `lib/solar-cost.test.ts` — herschreven: simple, advanced-gesaldeerd (terug ≤ afname),
  advanced-overschot (terug > afname), dubbeltarief, vaste kosten over `days`, null-paden.
- `lib/solar-history.test.ts` — `periodDelta`: kWh-native (geen /1000!), clamp, null bij ontbrekende grens.
- `app/api/solar-history/route.test.ts` — kosten-pad met realistische kWh-fixtures (verifieer dat
  €-bedragen NIET 1000× te laag zijn), baseline-marge, simple én advanced, teller-fout → null.
- `lib/settings-store.test.ts` — uitgebreid tarief: mode, geavanceerde velden, backward-compat oude vorm.
- `app/settings/page.test.tsx` — toggle wisselt velden; advanced-veld opslaan stuurt juiste `tariff`.

## Aannames / te verifiëren in de planfase

- `tarif_1` = dal (laag), `tarif_2` = normaal (hoog) — bevestigd via `electricity_meter_active_tariff`.
- Gesaldeerde kWh worden gewaardeerd tegen de door de gebruiker ingevulde **afnameprijs**
  (totaalprijs incl. belasting), passend bij "per saldo betaal je niets".
- AGENTS.md: lees de relevante Next.js-gids vóór route-/componentwijzigingen.
