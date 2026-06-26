# Ontwerp: Long-term statistics als bron voor energie & kosten (v3)

**Datum:** 2026-06-26
**Status:** Goedgekeurd (ontwerp) — klaar voor implementatieplan
**Bouwt voort op:** tariefmodel v2 (`2026-06-26-solar-cost-tariff-modes-design.md`)

## Aanleiding

De periode-totalen (kosten-kWh én productie-kWh) komen nu uit HA's korte historie
(`/api/history/period`), die maar **~10 dagen** bewaart en de beginstand mist voor
zeldzame sensoren (dal-teruglevering). Daardoor: maand/jaar leeg, week-teruglevering `—`,
en de bestaande productie-grafiek telt maand/jaar te laag.

HA's **long-term statistics** (`recorder/statistics_during_period`, WebSocket) bewaart
uur/dag/maand-totalen ~jaren en geeft per punt een `change`-veld = de exacte delta in de
eenheid van de sensor. **Geverifieerd live:** 36 dag-punten terug, `change: 0` voor
zeldzame dal-teruglevering (geen `—` meer). Dit lost alle drie de problemen op.

## Doel

Vervang de bron voor periode-totalen door long-term statistics, voor zowel de kosten als
de productie-grafiek (week/maand/jaar). De live "vandaag" power-curve blijft op realtime
states.

## Niet-doelen (YAGNI voor v3)

- WebSocket-pooling/caching (per request een korte verbinding is voldoende; optimalisatie later).
- Statistics voor de "vandaag" power-curve (statistics hebben geen sub-uur vermogen).
- Nieuwe UI/tariefvelden (v3 is puur databron — widget en instellingen ongewijzigd).

## Architectuur

| Bestand | Verantwoordelijkheid | Nieuw/wijziging |
|---|---|---|
| `lib/ha-stats.ts` | dunne WebSocket-client `getStatistics(...)` | nieuw |
| `lib/stats-energy.ts` | **pure** transforms: `change`-punten → totalen/bars | nieuw |
| `app/api/solar-history/route.ts` | kosten + productie-bars uit statistics; vandaag-curve onveranderd | wijziging |
| `lib/solar-history.ts` | verwijder dood: `periodDelta`, `energyBuckets`, `lifetimeAt` | wijziging |

Behouden in `solar-history.ts`: `parseHistory`, `downsamplePower` (vandaag power-curve),
`dayBoundaries`, `monthBoundaries` (start_time per bereik), `sumKwh`.

## WebSocket-client (`lib/ha-stats.ts`)

Node 22 heeft global `WebSocket` (geverifieerd). Eén verbinding levert álle sensoren tegelijk.

```ts
export interface StatPoint { start: number; end: number; change: number | null }

export async function getStatistics(
  ids: string[],
  startISO: string,
  endISO: string,
  period: "hour" | "day" | "month",
): Promise<Record<string, StatPoint[]>>;
```

- WS-URL afgeleid van de bestaande HA-config: neem dezelfde basis als `ha-client` (`HA_URL`
  of `http://supervisor/core`), vervang `http`→`ws` / `https`→`wss`, plak `/api/websocket`.
- Auth-flow: ontvang `auth_required` → stuur `{ type: "auth", access_token }` (`HA_TOKEN` of
  `SUPERVISOR_TOKEN`) → bij `auth_ok` stuur `{ id, type: "recorder/statistics_during_period",
  start_time, end_time, period, statistic_ids: ids, types: ["change"] }` → resolve op het
  `result`-bericht, sluit de socket.
- Timeout (bv. 20s) en `auth_invalid`/`result.success===false` → reject (de route vangt op).
- Resultaatvorm: `{ [id]: [{ start, end, change }] }` (start/end in epoch ms).

## Pure transforms (`lib/stats-energy.ts`)

```ts
import type { StatPoint } from "@/lib/ha-stats";
import type { SolarHistoryPoint } from "@/lib/types";

/** Som van change over de punten, geschaald (meters: scale=1; solar Wh→kWh: scale=0.001).
 *  null wanneer er geen punten zijn (sensor ontbreekt in het resultaat). */
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

`PeriodEnergy` voor de kosten wordt in de route samengesteld:
`{ afnameLow: sumChange(stats[importT1]), afnameHigh: sumChange(stats[importT2]),
   terugLow: sumChange(stats[exportT1]), terugHigh: sumChange(stats[exportT2]) }` (meters = kWh, scale 1).

## Route `/api/solar-history`

Per bereik een statistics-`period`: `today→"hour"`, `week/month→"day"`, `year→"month"`.
Start_time: `today→dayBoundaries(now,1)[0]`, `week→dayBoundaries(now,7)[0]`,
`month→dayBoundaries(now,30)[0]`, `year→monthBoundaries(now,12)[0]`. End = `now`.

- **Kosten** (alle bereiken, wanneer een tarief actief is): één `getStatistics([4 meters], start, now, period)`,
  bouw `PeriodEnergy` via `sumChange`, roep `computeTariffCost(energy, tariff, days)` aan
  (`days = (now-start)/86400000`). Eigen try/catch → `cost: null` bij WS-fout.
- **Productie-grafiek**:
  - `today`: ongewijzigd — `getHistory(SOLAR.currentPower)` states → `downsamplePower` (power-curve, W).
    `producedKwh` (vandaag) = `sumChange(stats[solaredge], 0.001)` uit dezelfde/eigen statistics-call (period "hour").
  - `week/month/year`: `getStatistics([solaredge], start, now, period)` → `points = barPoints(stats[solaredge], 0.001)`
    (Wh→kWh), `producedKwh = sumChange(stats[solaredge], 0.001)`. `chartType: "energy"`, unit `"kWh"`.

Implementatienoot: de kosten- en solar-statistics kunnen in **één** `getStatistics`-call
(alle ids samen) om WS-rondritten te beperken; de route splitst het resultaat per id.

## Wat verdwijnt

`periodDelta` (v2) en `energyBuckets` + de private `lifetimeAt` in `lib/solar-history.ts`
worden niet meer gebruikt → verwijderen, inclusief hun tests. De `SolarHistoryResponse`-vorm
(`points`, `summary.{producedKwh,cost}`) blijft identiek → widget ongewijzigd.

## Foutafhandeling

| Situatie | Gedrag |
|---|---|
| WS-fout/timeout/auth-fout | kosten `cost: null`; bars lege reeks; hoofdrespons 200 (graceful) |
| Sensor zonder statistics (ontbreekt in resultaat) | `sumChange` → null → betreffend totaal `—` |
| Geen tarief actief | `cost: null` (ongewijzigd t.o.v. v2) |
| Huidige partiële uur nog niet in statistics | "vandaag"-totaal loopt max ~1 uur achter (geaccepteerd; live power-curve blijft realtime) |

## Tests

- `lib/stats-energy.test.ts` — `sumChange` (schaal 1 en 0.001, lege/ontbrekende input, null-change), `barPoints` (mapping + scale).
- `app/api/solar-history/route.test.ts` — mock `@/lib/ha-stats` (`getStatistics`): kosten over **maand** nu niet-null; bars uit solar-change; sparse teruglevering `change:0` → `0`, niet `—`; WS-fout → `cost: null` + 200.
- `lib/solar-history.test.ts` — verwijder de tests voor `periodDelta`/`energyBuckets`/`lifetimeAt`; behoud de rest.
- `lib/ha-stats.ts` — de WS-client zelf wordt niet als unit getest (I/O); de pure transform-laag dekt de logica. Optioneel een handmatige rooktest tegen de live HA.

## Aannames / te verifiëren in de planfase

- Alle vier de tarief-tellers en `solaredge_lifetime_energy` hebben long-term statistics
  (`state_class: total_increasing`) — geverifieerd voor 3 van de 5; de andere twee horen bij
  dezelfde integraties.
- WS-URL-afleiding werkt zowel voor dev (`HA_URL`) als de add-on (`SUPERVISOR_TOKEN` → `ws://supervisor/core/api/websocket`).
- AGENTS.md: lees de relevante Next.js-gids vóór de route-wijziging.
