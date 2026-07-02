# Room comfort: derived psychrometric values on the metric card (Mollier variant A)

**Date:** 2026-07-02
**Status:** Approved (owner picked variant A from the mockup). Built on branch `feat/room-comfort` (off `main`).

## Context

Each room metric widget (`RoomMetricCard`) shows temperature + humidity (current value +
a recharts history line per metric), built from `RoomMetrics { key, name, metrics: MetricValue[] }`
in `mapMetrics`. Temperature (°C) and relative humidity (%) are exactly the two inputs a
Mollier / psychrometric chart needs — everything else is derived. This feature adds small
derived chips to the card: **dew point**, **absolute humidity**, and a **comfort/condensation
status**. (Chosen over a full mini-diagram: most useful and glanceable for a home dashboard.)

## Goal

For every room that reports BOTH temperature and humidity, show under the room name a small
chip row:
- **dauwpunt {Td}°** (dew point, whole degrees)
- **abs. vocht {w} g/kg** (absolute humidity, 1 decimal)
- a **status pill**: comfortable (green) / te vochtig (amber) / te droog (amber) / condensatierisico (red)

Rooms missing temperature or humidity show no chips.

## Design

### Psychrometric helpers — `lib/psychrometrics.ts` (new, pure)

Magnus formula, p = 1013 hPa. All pure, unit-tested.
- `saturationVaporPressure(T): number` → `6.112 * Math.exp((17.62*T)/(243.12+T))` (hPa)
- `absoluteHumidity(T, RH): number` → mixing ratio g/kg: `e=(RH/100)*es(T); return 621.97 * e/(1013 - e)`
- `dewPoint(T, RH): number` → `a = Math.log(RH/100) + (17.62*T)/(243.12+T); return 243.12*a/(17.62-a)`
- `roomComfort(T, RH): RoomComfort` → `{ dewPoint, absHumidity, status }` where
  `status`: `condensation` if `(T - dewPoint) < 3`; else `humid` if `RH > 65`; else `dry` if `RH < 35`; else `comfortable`.

Sanity (locked by test): `20, 50` → absHumidity ≈ 7.24 g/kg, dewPoint ≈ 9.26 °C.

### Types — `lib/types.ts`

```ts
export type ComfortStatus = "comfortable" | "humid" | "dry" | "condensation";
export interface RoomComfort { dewPoint: number; absHumidity: number; status: ComfortStatus; }
```
Add to `RoomMetrics`: `comfort: RoomComfort | null;` (null when temp or humidity is missing/unavailable).

### Mapper — `lib/state-mapper.ts` `mapMetrics`

After building `metrics`, read the temperature + humidity values from it (`metrics.find(m => m.kind === "temperature")?.value`, same for humidity). If BOTH are non-null numbers → `comfort = roomComfort(T, RH)`, else `comfort = null`. Add `comfort` to the returned `RoomMetrics`.

### UI — `app/components/RoomMetricCard.tsx`

Under the room-name `<h2>`, when `room.comfort != null`, render a small chip row (reuse the
card's muted/rounded style, size like existing `text-xs`):
- `dauwpunt {Math.round(comfort.dewPoint)}°`
- `{t("comfort.absHumidity")} {comfort.absHumidity.toFixed(1)} g/kg`
- a status pill: label = `t("comfort." + status)`; colour by status — comfortable `#22b39e`, humid/dry `var(--accent-warn)`, condensation `#e85f4c` (background tint + text, small rounded).

No chips when `room.comfort` is null. Do not change the existing chart panels.

### i18n — `lib/i18n.ts` (en + nl)

`comfort.dewPoint` ("Dew point"/"Dauwpunt"), `comfort.absHumidity` ("Abs. humidity"/"Abs. vocht"),
`comfort.comfortable` ("Comfortable"/"Comfortabel"), `comfort.humid` ("Humid"/"Te vochtig"),
`comfort.dry` ("Dry"/"Te droog"), `comfort.condensation` ("Condensation risk"/"Condensatierisico").

## Non-goals

- The mini Mollier diagram (variant B) and comfort-band chart overlay (variant C) — not built.
- Wet-bulb / enthalpy display (jargon; dropped per owner feedback).
- Configurable thresholds / per-room tuning UI. Thresholds are constants (owner can adjust in code); this is `main`-based / owner-specific like the other hardcoded features.
- History of the derived values.

## Testing

- `lib/psychrometrics.test.ts`: es/absoluteHumidity/dewPoint at the reference point (20/50 → 7.24, 9.26); `roomComfort` status at each boundary (condensation when T−Td<3 e.g. 22.5/82 → condensation; humid RH 70; dry RH 30; comfortable 21.5/52).
- `lib/state-mapper.test.ts`: `mapMetrics` sets `comfort` when both temp+humidity present; `null` when one is missing.
- `app/components/RoomMetricCard.test.tsx`: renders the 3 chips + correct status label/colour when `comfort` present; renders no chips when `comfort` is null.
- Full suite + build green. Live: chips show on rooms with both sensors; Badkamer-like high-humidity room shows condensation pill.

## Rollout

Additive: new pure lib + one nullable `RoomMetrics` field + a chip row. No change to existing
metrics/charts. Branch off `main`, independently mergeable (does not depend on the battery branch).
Deploy needs an add-on version bump (as usual).
