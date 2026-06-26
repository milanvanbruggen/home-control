# Solar backdrop: production-driven "strong sun" override

**Date:** 2026-06-26
**Status:** Approved design, ready for implementation plan

## Problem

The Solar card's weather backdrop went dark grey on a hot, sunny day. Root cause
(verified against live Home Assistant data):

- The backdrop is driven by `weather.forecast_home`, which reported
  `cloud_coverage: 93` and `uv_index: 2` while it was 32.9 °C and visibly sunny.
- `weather.forecast_home` is a **forecast** integration (Met.no). Its cloud
  coverage and UV are predicted values, not real-time observations, and they were
  simply wrong for the moment.
- The existing coverage-driven mapper (`lib/sky-visuals.ts`) faithfully turned 93 %
  coverage into `cloudy` → grey. Working as coded; the input was bad.

Note: the "Coverage 29 %" stat in the card is **unrelated** — it is
`sensor.home_solar_percentage` (solar self-sufficiency), not cloud cover. It was a
red herring in the original report and is **not** changed by this work.

### Why no simpler signal exists

Confirmed against the live instance:

- **No** irradiance / illuminance / solar-radiation / UV sensor entities exist.
- Only **one** weather entity (`weather.forecast_home`); no observation-based
  second source.
- `uv_index` comes from the same forecast as `cloud_coverage`, so it is not an
  independent signal (it agreed with the wrong forecast: `2`).

The **only** real-time ground truth for actual sunshine is the panels themselves
(`sensor.solaredge_current_power`).

## Goal

Keep `weather.forecast_home` as the base look, but **brighten** the backdrop when
the panels prove the sun is actually reaching them. Never darken; never hide
precipitation.

## Non-goals

- No change to the "Coverage" stat or any energy figure.
- No new configuration (no panel kWp entry). Detection is self-calibrating.
- No darkening of an over-optimistic forecast (production low ≠ proof of cloud,
  e.g. evening shadow). Brighten-only, matching the user's stated intent.
- No new HA entities or integrations.

## Detection: self-calibrating clear-sky reference

Chosen over a configured clear-sky model so the user enters nothing, and over a
fixed-watt threshold because absolute watts are meaningless without normalisation
(579 W is excellent at sunset, poor at noon).

**Reference = the recent best production at this same time of day.** For each
local hour-of-day, take the **maximum** hourly production over the last **14 days**.
Same wall-clock time ≈ same sun geometry, so this auto-accounts for panel
orientation and shading — no kWp, no astronomy.

Evidence the signal is sharp (live 14-day hourly-max, watts):

| hour | clear-day max | avg | worst | spread |
|------|--------------:|----:|------:|-------:|
| 12   | 2284 | 1514 | 500 | 4.6× |
| 15   | 2116 | 1485 | 478 | 4.4× |
| 18   | 1304 |  868 | 320 | 4.1× |

At every daytime hour the best vs worst day differ 3–5×, so the ratio cleanly
separates clear from overcast. (At the time of the report: 579 W at hour 18 →
579 / 1304 ≈ **0.44**, i.e. genuinely "partly cloudy", not full sun — which is why
the design is graded, not binary.)

### Reference curve

- Build a per-hour map `hour (0–23) → max production (W)` over 14 days.
- The reference at a moment is **interpolated** between the two surrounding hourly
  maxima so it tracks the sun smoothly within the hour (e.g. 18:42 sits between
  hour 18 = 1304 W and hour 19 = 719 W), rather than using a flat hour bucket.
- Hour-of-day buckets are computed in the **home's local timezone** (the add-on
  runs in HA's timezone; for standalone/dev, fall back to server-local — acceptable,
  documented).

## Ratio → look

```
ratio = currentPowerW / reference
ratio ≥ 0.75            → sunny       (production coverage ≈ 20 %)
0.45 ≤ ratio < 0.75     → partlycloudy (production coverage ≈ 55 %)
ratio < 0.45            → no opinion  (production coverage = null → keep forecast)
```

These thresholds are tunable constants. They are mapped to a **production-implied
cloud coverage** so the override reuses the existing `conditionFromCoverage` machinery
rather than introducing a parallel condition path.

## Blend: brighten-only

```
effectiveCoverage = min(forecastCoverage, productionCoverage)
```

- Applied **only** for dry conditions already in `COVERAGE_DRIVEN`
  (`sunny`, `partly-cloudy`, `cloudy`). Rain / fog / snow / thunder are untouched —
  production can never hide precipitation.
- `min` makes it brighten-only: lower coverage = sunnier wins. A low production
  reading (high `productionCoverage`) can never beat a clear forecast.
- Null handling: if `forecastCoverage` is null, use `productionCoverage`; if
  `productionCoverage` is null, use `forecastCoverage` (current behaviour).
- The result is written into `solar.sky.cloudCoverage` server-side, so the existing
  client call `resolveSkyVisual(cond, isDay, sky.cloudCoverage)` needs **no change**.

## Guards / fallbacks

Each makes the override yield to the plain forecast (never worse than today):

- **Low sun:** if the reference for the current hour is below a floor (≈ 200 W,
  early morning / late evening), do not override — grey is fine when the sun is low.
- **No / thin history:** fewer than a minimum number of usable days, or no envelope
  yet (cold start) → no override.
- **Statistics fetch failure:** envelope stays at its last good value (SWR) or null;
  on null, no override. A failed refresh never blocks the 3 s state poll.

## Architecture & wiring

New pure module **`lib/sun-strength.ts`**:

- `buildClearSkyEnvelope(points, tz): ClearSkyEnvelope` — pure; 14-day hourly-max
  curve from statistics points.
- `clearSkyReference(envelope, atMs): number | null` — interpolated reference,
  applying the low-sun floor.
- `productionCloudCoverage(currentW, reference): number | null` — ratio → coverage.
- `blendCoverage(forecast, production): number | null` — the `min`, null-aware.

Cached envelope provider (mirrors `lib/hue-bridge.ts` TTL + stale-while-revalidate):

- `getClearSkyEnvelope()` — ~1 h TTL, SWR refresh. Cold start returns null.
- Source: `getStatistics([SOLAR.currentPower], start, end, "hour")` extended to
  request the **`max`** type. `getStatistics` currently hardcodes `types: ["change"]`;
  add an optional `types` parameter (default `["change"]`) and a `max` field on
  `StatPoint`.

Integration in **`app/api/state/route.ts`** (the 3 s poll):

```
const [states, sceneGradients, envelope] = await Promise.all([
  getStates(), getSceneGradients(), getClearSkyEnvelope(),
]);
const app = mapHaStatesToAppState(...);
applySunStrength(app.solar, envelope, Date.now()); // mutates sky.cloudCoverage, dry-only, brighten-only
```

`applySunStrength` (in `lib/sun-strength.ts`) reads `solar.currentPowerW`,
`solar.sky.condition`, `solar.sky.cloudCoverage`, and writes the blended coverage.
`mapSky` stays pure; the client (`SolarCard`) is unchanged.

## Data / type changes

- `lib/ha-stats.ts`: `StatPoint` gains optional `max?: number | null`;
  `getStatistics` gains optional `types` param (default `["change"]`) and maps the
  requested fields through.
- `lib/types.ts`: no public shape change required (`SkyState.cloudCoverage` already
  exists and is the carrier). Optionally add a debug field later — not now (YAGNI).

## Edge cases

- Forecast condition `cloudy` with `cloudCoverage = null` (some integrations): blend
  falls back to `productionCoverage`, so strong production still brightens it.
- Strong production under a `rainy` forecast: not overridden (rain protected).
- Brand-new install / 14 days of solid overcast: reference low → ratio can read
  high even when cloudy (false positive). Accepted: 14 straight overcast days are
  rare; the low-sun floor and the dry-condition gate bound the blast radius.
- Inverter clipping on the clearest days inflates the per-hour max slightly →
  makes the override marginally **more** conservative, which is safe.

## Testing

Pure functions in `lib/sun-strength.ts` are unit-tested with no I/O:

- `buildClearSkyEnvelope`: 14-day fixture → correct per-hour maxima; tz bucketing.
- `clearSkyReference`: interpolation between hours; low-sun floor returns null.
- `productionCloudCoverage`: threshold boundaries (0.45, 0.75), null below floor.
- `blendCoverage`: brighten-only (`min`), both null branches.
- `applySunStrength`: dry-only gate (no effect on `rain`), brighten-only on a
  pessimistic forecast, no-op when envelope null.
- Regression: the live scenario — forecast 93 %, production 579 W vs reference
  ≈ interpolated(1304,719) → lands in the partly-cloudy band, not grey, not full sun.

Cache/SWR provider tested like `hue-bridge` (injected clock/fetch).

## Tunable constants (one place, documented)

`SUN_STRENGTH = { windowDays: 14, sunnyRatio: 0.75, partlyRatio: 0.45,
referenceFloorW: 200, minDays: 3, ttlMs: 3_600_000 }`.

## Rollout

Pure additive change; if the envelope provider is disabled or always returns null,
behaviour is identical to today. No migration, no new entities, no config.
