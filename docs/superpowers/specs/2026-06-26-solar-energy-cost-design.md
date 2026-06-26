# Ontwerp: Energiekosten in de Solar-widget

**Datum:** 2026-06-26
**Status:** Goedgekeurd (ontwerp) — klaar voor implementatieplan
**Bouwt voort op:** de zonnepanelen-widget (`docs/superpowers/specs/2026-06-25-solar-panel-widget-design.md`)

## Doel

Laat de gebruiker in Instellingen een stroomtarief invullen, zodat de Solar-widget
per gekozen termijn (Vandaag/Week/Maand/Jaar) de **kosten** van afgenomen energie en
de **opbrengst** van teruglevering toont.

## Beslissingen (door gebruiker bevestigd)

- **Handmatig tarief** (niet live uit HA).
- **Eén vlak tarief** voor import en één voor teruglevering (geen dag/nacht-splitsing).
- Kosten/opbrengst als **termijn-totalen** (twee tegels), niet als extra grafiek.

## Niet-doelen (YAGNI voor v1)

- Dag/nacht-tariefsplitsing (`tarif_1`/`tarif_2` aparte prijzen).
- Live prijs uit `sensor.cic_electricity_price_used`.
- Kosten als staven/lijn in de grafiek zelf.
- Valutakeuze — vast EUR (NL-huishouden).

## Gebruikte HA-entities (cumulatieve metertellers, geverifieerd)

| Rol | Entity | Eenheid |
|---|---|---|
| Import dal | `sensor.electricity_meter_energy_consumption_tarif_1` | kWh |
| Import piek | `sensor.electricity_meter_energy_consumption_tarif_2` | kWh |
| Teruglevering dal | `sensor.electricity_meter_energy_production_tarif_1` | kWh |
| Teruglevering piek | `sensor.electricity_meter_energy_production_tarif_2` | kWh |

Alle vier zijn cumulatief en monotoon stijgend → periode-kWh = delta over de termijn
(hergebruik `energyBuckets` uit `lib/solar-history.ts`).

## Architectuur

Volgt het bestaande patroon: config → types → (settings) → API → component.

| Bestand | Verantwoordelijkheid | Nieuw/wijziging |
|---|---|---|
| `config/devices.ts` | `GRID_METER` object met de 4 teller-entity-ids | wijziging |
| `lib/types.ts` | `ElectricityTariff`, `AppSettings.tariff`, `SolarCostSummary`, `summary.cost` | wijziging |
| `lib/settings-store.ts` | `tariff` opnemen in default + sanitize (getal ≥ 0 of null) | wijziging |
| `app/api/settings/route.ts` | PUT-schema accepteert `tariff` | wijziging |
| `lib/solar-cost.ts` | **puur**: `tariffCost(importKwh, exportKwh, tariff)` → kosten/opbrengst | nieuw |
| `app/api/solar-history/route.ts` | tarief lezen; bij ingevuld de 4 tellers ophalen, `cost` in summary | wijziging |
| `lib/metrics.ts` | `formatEuro(value)` (nl-NL "€ 4,12") | wijziging |
| `app/components/SolarCard.tsx` | kosten-rij tonen als `summary.cost` aanwezig | wijziging |
| `app/settings/page.tsx` | "Tarieven"-kaart met twee €/kWh-invoervelden | wijziging |
| `lib/i18n.ts` | NL+EN strings | wijziging |

## Datamodel (types)

```ts
// lib/types.ts
export interface ElectricityTariff {
  importPrice: number | null;  // €/kWh betaald voor afgenomen energie
  exportPrice: number | null;  // €/kWh ontvangen voor teruglevering
}

// AppSettings krijgt:
//   tariff: ElectricityTariff;

export interface SolarCostSummary {
  importKwh: number | null;     // afgenomen kWh over de termijn
  exportKwh: number | null;     // teruggeleverd kWh over de termijn
  importCost: number | null;    // € kosten
  exportEarnings: number | null;// € opbrengst
}

// SolarHistoryResponse.summary krijgt:
//   cost: SolarCostSummary | null;   // null wanneer geen tarief is ingesteld
```

Default-tarief: `{ importPrice: null, exportPrice: null }`.

## Berekening

**Pure rekenlogica (`lib/solar-cost.ts`):**
```ts
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

**Periode-kWh (in de route):** voor elke teller de delta over `[boundaries[0], now]`
via `energyBuckets(parseHistory(raw), [boundaries[0], now])[0]?.value`. Dan:
- `importKwh = (t1 != null && t2 != null) ? round2(t1 + t2) : null`
- `exportKwh = (p1 != null && p2 != null) ? round2(p1 + p2) : null`

Eén ontbrekende teller → totaal `null` (geen halve/onjuiste kosten tonen).

## API-wijziging `/api/solar-history`

- Lees `getSettings().tariff` server-side.
- Als `importPrice == null && exportPrice == null` → `summary.cost = null`, verder ongewijzigd.
- Anders: haal (parallel, naast de bestaande calls) de 4 GRID_METER-tellers op over de
  termijn, bereken `importKwh`/`exportKwh`, roep `tariffCost(...)` aan, en zet
  `summary.cost = { importKwh, exportKwh, importCost, exportEarnings }`.
- HA-fout in de kosten-tellers mag de hoofdrespons niet breken: bij fout `cost: null`.
- `range`-validatie en bestaande velden blijven gelijk.

## Instellingen-UI

Nieuwe **TariffsCard** in `app/settings/page.tsx` (na de bestaande Notifications-kaart):
- Twee invoervelden met label + €/kWh-suffix: **Importprijs**, **Teruglevering**.
- Leeg veld = `null` (functie uit). Komma-invoer wordt geparsed (`"0,23" → 0.23`).
- Opslaan via dezelfde debounced PUT `/api/settings` met `{ tariff }` die de
  card-order/hidden-metrics ook gebruiken.
- Validatie client- én serverkant: getal ≥ 0, anders `null`.

## Widget-UI

In `SolarCard`: onder de bestaande drie stats verschijnt een **tweede rij** met twee
brede tegels, **alleen als `summary.cost` niet null is**:
- **Kosten** — `formatEuro(cost.importCost)` (neutraal/amber)
- **Opbrengst** — `formatEuro(cost.exportEarnings)` (teal, `var(--accent-cool)`)

Geen tarief → rij verborgen, kaart blijft schoon. `null`-waarden tonen `—`.

`formatEuro(v: number | null)`: `"€ 4,12"` (nl-NL komma), `—` bij null.

## i18n (NL / EN)

`solar.cost` = Kosten / Cost · `solar.earnings` = Opbrengst / Earnings ·
`settings.tariffs` = Tarieven / Tariffs · `tariff.import` = Importprijs / Import price ·
`tariff.export` = Teruglevering / Feed-in price ·
`tariff.hint` = Kijk op je energierekening / Check your energy bill ·
`tariff.unit` = €/kWh.

## Randgevallen

| Situatie | Gedrag |
|---|---|
| Geen tarief ingesteld | Geen kosten-rij; `summary.cost = null` |
| Eén teller `unavailable` | Betreffende kWh `null` → kosten/opbrengst `—` |
| HA-fout bij kosten-tellers | `cost: null`, rest van de respons werkt door |
| Negatieve delta (reset) | Clamp 0 (zit al in `energyBuckets`) |
| Ongeldige tarief-invoer | Geparsed naar `null` (functie uit) |

## Performance

- Kosten-tellers worden alleen opgehaald wanneer een tarief is ingesteld.
- Alle history-calls (power/lifetime + 4 tellers) lopen via `Promise.all` → wachttijd ≈
  de traagste enkele call, niet de som.

## Tests

- `lib/solar-cost.test.ts` — `tariffCost`: beide prijzen, één prijs null, kWh null, afronding.
- `lib/settings-store` (bestaand) — `tariff` sanitize: geldige getallen, negatief→null, ontbrekend→default.
- `app/api/solar-history/route.test.ts` — kosten-pad: tarief ingesteld → `cost` gevuld;
  geen tarief → `cost: null`; teller-fout → `cost: null`.
- `lib/metrics.test.ts` — `formatEuro`.
- `app/components/SolarCard.test.tsx` — kosten-rij zichtbaar bij `cost`, verborgen zonder.
- `app/settings/page.test.tsx` (bestaand) — minimale update als de Tarieven-kaart een
  bestaande render-assertie raakt.

## Aannames / te verifiëren in de planfase

- Exacte vorm van `getSettings()`/sanitize in `lib/settings-store.ts` en het PUT-schema in
  `app/api/settings/route.ts` (om `tariff` consistent toe te voegen).
- Bestaande input-/persist-patronen op de settings-pagina (om de Tarieven-kaart te spiegelen).
- AGENTS.md: lees de relevante Next.js-gids vóór route-/componentwijzigingen.
