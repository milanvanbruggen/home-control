# Ontwerp: Zonnepanelen-widget

**Datum:** 2026-06-25
**Status:** Goedgekeurd (ontwerp) — klaar voor implementatieplan
**Layout:** A (Hero + dagcurve) + tijdsbereik-schakelaar

## Doel

Toon de zonnepaneel-/energiegegevens uit Home Assistant op het home-scherm van de
app, in de bestaande stijl (glass cards, Fraunces-display, navy ink, masonry-grid).
De kaart laat in één oogopslag zien wat de panelen *nu* opwekken, hoe de dag verloopt,
en geeft via een bereik-schakelaar zicht op week/maand/jaar.

## Niet-doelen (YAGNI voor v1)

- forecast.solar verwachtingslijn + piektijd (bewust uitgesteld; los uit te breiden).
- Prijs- en CO₂-accenten (`cic_electricity_price_used`, `electricity_maps_*`).
- Thuisbatterij (niet aanwezig in deze HA-installatie).
- Interactieve besturing — de kaart is puur informatief (geen `callService`).

## Gebruikte Home Assistant entities

Geverifieerd tegen de live HA-installatie (`HA_URL` uit `.env.local`, 524 entities).

| Rol | Entity | Eenheid | Bron |
|---|---|---|---|
| Live opbrengst (hero) | `sensor.solaredge_current_power` | W | SolarEdge |
| Lifetime totaal (delta-bron) | `sensor.solaredge_lifetime_energy` | Wh | SolarEdge |
| Dekking woning | `sensor.home_solar_percentage` | % | HA |
| Afname van net | `sensor.electricity_meter_power_consumption` | kW | P1-meter |
| Teruglevering naar net | `sensor.electricity_meter_power_production` | kW | P1-meter |

**Belangrijk:** SolarEdge levert geen kant-en-klare "vandaag opgewekt"-sensor. Die
waarde wordt **afgeleid** uit de cumulatieve `solaredge_lifetime_energy` (zie
"Geschiedenis-logica").

## Architectuur

Volgt het bestaande patroon van de app: **config → types → mapper → API → component**.

| Bestand | Verantwoordelijkheid | Nieuw/wijziging |
|---|---|---|
| `config/devices.ts` | `SOLAR` config-object met de 5 entity-id's | wijziging |
| `lib/types.ts` | `SolarState` (live) → `AppState.solar`; history-types | wijziging |
| `lib/state-mapper.ts` | `mapSolar(byId)` → live kW, net-flow, dekking, lifetime | wijziging |
| `lib/ha-client.ts` | nieuw `getHistory(entityIds, startISO, endISO, opts)` | wijziging |
| `lib/solar-history.ts` | **pure** transformatie HA-history → curve / kWh-delta's + samenvatting | nieuw |
| `app/api/solar-history/route.ts` | route `?range=today\|week\|month\|year` → punten + samenvatting | nieuw |
| `app/components/SolarCard.tsx` | de widget (hero, Recharts, bereik-pill, 3 stats) | nieuw |
| `app/page.tsx` | `Unit` uitbreiden met `{ kind: "solar" }` + render | wijziging |
| `lib/home-cards.ts` | `"solar"` opnemen in `defaultCardIds()` (bovenaan) | wijziging |
| `lib/i18n` (bestaand) | Nederlandse labels voor de kaart | wijziging |

### Scheiding live vs. historisch

- **Live** (hero-kW, net-flow, dekking, lifetime) komt mee in `/api/state`, dat de
  app al elke 3s pollt. Geen nieuwe polling-loop.
- **Historisch** (grafiek + "Vandaag kWh"-stat) haalt de `SolarCard` zelf op via
  `/api/solar-history` bij mount en bij bereik-wissel — exact zoals `RoomMetricCard`
  zijn grafiekdata fetcht. Zo blijft de 3s-poll licht en hangt de grafiek niet aan
  de live-staat.

## Datastromen

```
[HA /api/states] --getStates--> mapHaStatesToAppState --mapSolar--> AppState.solar
       |                                                                  |
       v                                                                  v
  /api/state (3s poll) ---------------------------------------> SolarCard (hero, net, dekking, lifetime)

[HA /api/history/period] --getHistory--> solar-history (transform) --> /api/solar-history
                                                                              |
                                                                              v
                                                            SolarCard (grafiek + "Vandaag" kWh)
```

## Geschiedenis-logica (`lib/solar-history.ts`)

Pure functies, los te unit-testen zonder netwerk. Input = ruwe HA-history JSON.

**HA REST-vorm:** `GET {HA_URL}/api/history/period/{startISO}?filter_entity_id={id}&end_time={endISO}&minimal_response&no_attributes&significant_changes_only`
→ array met per entity een lijst van `{ state, last_changed }`.

**Vandaag (vermogenscurve):**
- Bron: history van `solaredge_current_power` van begin dag tot nu.
- Parse states naar `{ t, w }`, sla `unavailable`/`unknown`/niet-numeriek over (→ null-gat).
- Downsample naar ~48 punten (hergebruik de bestaande `windowAndDownsample`-aanpak uit
  `metrics-sampler`/`metrics-history` waar mogelijk, anders een eigen bucket-mean).
- `chartType: "power"`, eenheid W (weergave kW).

**Week / Maand / Jaar (kWh-staven):**
- Bron: history van `solaredge_lifetime_energy` (cumulatief, monotoon stijgend).
- Bucket per dag (week/maand) of per maand (jaar). Neem per bucket de **laatste** waarde.
- Productie per bucket = `laatste(bucket_n) − laatste(bucket_{n-1})`.
- `chartType: "energy"`, eenheid kWh (Wh/1000).

**Samenvatting (`summary.producedKwh`):**
- Vandaag = `lifetime(nu) − lifetime(eerste meting vandaag)`.
- Andere bereiken = som van de bucket-delta's.

**Randgevallen in de logica:**
- Negatieve delta (teller-reset / integratie-hapering) → clamp naar 0.
- Leeg of te kort history-resultaat → lege puntenreeks, `producedKwh: null`.
- Ontbrekende bucket-grenzen → bucket overslaan, geen crash.

## API-contract `/api/solar-history`

**Request:** `GET /api/solar-history?range=today|week|month|year`

**Response 200:**
```jsonc
{
  "range": "today",
  "chartType": "power",          // "power" voor today, "energy" voor week/month/year
  "unit": "W",                   // of "kWh"
  "points": [{ "t": 1782400000000, "value": 3240 }, /* ... */ ],
  "summary": { "producedKwh": 18.4 }
}
```

**Fouten:** ongeldige `range` → 400 `{ error: "bad_request" }`. HA-fout → 502 met
lege `points` zodat de kaart een nette lege staat kan tonen.

## Types (schets)

```ts
// lib/types.ts
export type GridDirection = "import" | "export" | "idle";

export interface SolarState {
  available: boolean;
  currentPowerW: number | null;   // sensor.solaredge_current_power
  netGridKw: number | null;       // consumption - production
  gridDirection: GridDirection;
  coveragePct: number | null;     // sensor.home_solar_percentage
  lifetimeKwh: number | null;     // sensor.solaredge_lifetime_energy / 1000
}

export interface AppState {
  // ... bestaand
  solar: SolarState;
}

export type SolarRange = "today" | "week" | "month" | "year";
export interface SolarHistoryPoint { t: number; value: number | null; }
export interface SolarHistoryResponse {
  range: SolarRange;
  chartType: "power" | "energy";
  unit: "W" | "kWh";
  points: SolarHistoryPoint[];
  summary: { producedKwh: number | null };
}
```

## Component `SolarCard.tsx`

- **Props:** `{ solar: SolarState }` (live uit `AppState`); history zelf gefetcht.
- **Hero:** groot live-vermogen (kW), Fraunces, met zon-icoon. nl-NL getalnotatie (komma).
- **Grafiek:** Recharts. `today` → `Area`/`Line` (vermogenscurve); `week/month/year` →
  `Bar` (kWh per bucket). Kleur in de solar-gradient (`#f0913f`).
- **Bereik-pill:** menu met Vandaag / Week / Maand / Jaar (hergebruik `Menu`/`Badge`
  primitives en het range-patroon van `RoomMetricCard`).
- **3 stats:** Vandaag (kWh, uit history-summary), Net nu (dynamisch label + kleur:
  teal bij teruglevering, amber bij afname), Dekking (%).
- **Styling:** `Card`-primitive, glass, `rounded-3xl`; CSS-vars uit `globals.css`.
- **Laadstaten:** skeleton/spinner tijdens history-fetch; nette lege staat bij fout of
  0 data; `—` voor `null`-waarden.

## Plaatsing & ordening

- `defaultCardIds()` krijgt `"solar"` vooraan (prominente positie).
- De kaart doet mee in het bestaande `cardOrder`-systeem (herordenbaar, persisteert
  via `/api/settings`) — geen nieuw mechanisme nodig.

## Randgevallen (samengevat)

| Situatie | Gedrag |
|---|---|
| Nacht / 0 productie | Hero "0 kW", vlakke curve, dekking 0%, net = afname |
| Sensor `unavailable` | `—` tonen, kaart blijft staan |
| History-call faalt | Grafiek lege staat; live-deel werkt door |
| Lifetime-delta < 0 | Clamp naar 0 voor die bucket |
| Eerste meting ontbreekt vandaag | `producedKwh: null`, stat toont `—` |

## Performance

- Live waarden liften mee op de bestaande 3s `/api/state`-poll (geen extra netwerk).
- History wordt alleen bij mount + bereik-wissel opgehaald en per bereik in
  component-state gecachet.
- HA-history-requests gebruiken `minimal_response&no_attributes&significant_changes_only`
  om payload te beperken (vooral voor `year`). Server-side korte cache is een latere
  optimalisatie, niet nodig voor v1.

## Tests

- `lib/solar-history.test.ts` — delta/bucket-logica, clamp bij reset, downsampling,
  lege/korte input. **Kern van de feature, grondig testen.**
- `lib/state-mapper` — `mapSolar` met beschikbare/onbeschikbare entities, net-flow teken.
- `app/components/SolarCard.test.tsx` — rendert hero/stats, bereik-wissel triggert fetch,
  nette lege staat. Vitest + RTL, `wrapper: NL` (LanguageProvider), `*.test.tsx` co-located.

## Aannames / te verifiëren in de planfase

- Exacte i18n-structuur (`lib/i18n` of provider) en getalformattering (`lib/metrics.ts`).
- Of `windowAndDownsample` herbruikbaar is voor de power-curve of dat een kleine eigen
  downsampler schoner is.
- AGENTS.md: lees de relevante Next.js-gids in `node_modules/next/dist/docs/` vóór het
  schrijven van de route/component (deze Next.js-versie wijkt af).
