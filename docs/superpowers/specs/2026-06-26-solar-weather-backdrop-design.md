# Solar widget — weather-adaptive backdrop

**Date:** 2026-06-26
**Status:** Approved design (pending written-spec review)
**Topic:** Redesign the Solar card so its background reflects live weather (sunny / cloudy / rain / snow / night), with a subtle animated companion.

---

## 1. Goal

Make the Solar card's background _show the weather_. Today the card is a plain
white `Card` with dark text. After this change the whole card becomes a
weather-driven gradient "sky" with a subtle animated companion layer (drifting
clouds, falling rain, drifting snow, sun glow/rays, stars + moon at night). The
production data stays fully legible on top via a scrim + frosted glass panels.

This matches the existing app pattern: `ChillCard` / `ThermostatCard` already
render `<Card style={{background: gradient}} className="relative overflow-hidden text-white">`
with a watermark icon and glass sub-controls. The Solar card adopts the same
shape; the animated weather layer replaces the static watermark.

**Non-goals (v1):** weather forecast UI, hourly weather timeline, controlling
anything, per-device energy. Pure visual redesign + the minimal data plumbing to
drive it.

---

## 2. Approved design decisions

- **Treatment = "full sky scene" (direction A)**: the whole card is the weather
  gradient, white text, animated companion behind the data. Chosen over a
  "sky band" or "subtle wash" because the goal is weather _visible in the
  background_, and it matches ChillCard/ThermostatCard.
- **Subtle animation**: slow, low-key motion (clouds drift, rain/snow fall, sun
  rays rotate very slowly, stars twinkle). Never distracting.
- **Night is its own state**: when the sun is below the horizon the card goes
  deep indigo with moon + stars (clear) or dark overcast (cloudy). There is no
  production at night, which the dark sky communicates.
- **Legibility is guaranteed, not best-effort**: a soft top/bottom scrim plus
  frosted-glass data panels plus text-shadow keep white text readable on _every_
  condition — bright (sunny/snow) and dark (rain/night) alike.

### Refinement over the browser mockup (flag for review)

The mockups used **light** frosted glass (`white/14`) for the data panels. That
reads fine on dark skies but is marginal on bright skies (sunny's golden lower
band, snow's pale band): white text/white chart line on light glass loses
contrast. **Decision: data panels use _dark_ frosted glass**
(`rgba(13,22,38,0.22)` + `backdrop-blur` + `border-white/15`). A frosted-dark
panel grounds the data against any sky and keeps white text + a white chart line
crisp in all conditions. Everything else matches the mockups. _This is the one
visual point that differs from what you saw — veto it at review if you prefer the
lighter look and accept the contrast trade-off._

---

## 3. Data model & flow

Weather data already exists in Home Assistant and is reachable with the current
HA client — no new auth, no new fetch path:

- `weather.forecast_home` — `state` = condition (HA enum), `attributes.cloud_coverage` (0–100).
- `sun.sun` — `state` = `above_horizon` / `below_horizon` (+ `elevation`).

`mapSolar(byId)` in `lib/state-mapper.ts` already receives the full entity map,
so it can read both entities. We compute a normalized `sky` and **nest it on
`SolarState`**. This keeps `<SolarCard solar={unit.solar} />` and the `/api/state`
route unchanged (the route returns `AppState` wholesale; a nested field is
additive). The page's `unit` abstraction needs no edit.

### Types (`lib/types.ts`)

```ts
/** Normalized sky condition — already de-noised from HA's raw enum.
 *  Day/night is carried separately in `isDay`, NOT folded into this. */
export type SkyCondition =
  | "sunny" | "partly-cloudy" | "cloudy" | "fog"
  | "rain" | "pouring" | "snow" | "sleet" | "thunder"
  | "unknown";

export interface SkyState {
  condition: SkyCondition;   // normalized
  isDay: boolean;            // sun.sun above_horizon
  cloudCoverage: number | null; // 0–100, for optional tuning
  raw: string | null;        // HA raw condition, for debugging
}

export interface SolarState {
  // ...existing fields unchanged...
  sky: SkyState;             // NEW
}
```

### Config (`config/devices.ts`)

```ts
export const WEATHER = {
  entity: "weather.forecast_home",
  sun: "sun.sun",
} as const;
```

### Normalization (`lib/state-mapper.ts`)

New exported `mapSky(byId)` (exported for unit tests), called from within
`mapSolar` and assigned to `sky`. Pure mapping, no UI concerns:

- `isDay` = `byId.get(WEATHER.sun)?.state === "above_horizon"` (default `true`
  when the sun entity is missing — daytime is the safe default for a solar card).
- `cloudCoverage` = numeric `cloud_coverage` attribute, else `null`.
- `condition` = normalize the weather entity's `state`:

| HA raw condition | SkyCondition |
|---|---|
| `sunny`, `clear-night` | `sunny` |
| `partlycloudy` | `partly-cloudy` |
| `cloudy`, `windy`, `windy-variant` | `cloudy` |
| `fog` | `fog` |
| `rainy` | `rain` |
| `pouring` | `pouring` |
| `lightning`, `lightning-rainy` | `thunder` |
| `snowy`, `hail` | `snow` |
| `snowy-rainy` | `sleet` |
| `exceptional`, unknown, unavailable, missing | `unknown` |

> `clear-night` maps to `sunny` because day/night is decided by `isDay`; the
> visual layer turns a clear sky into the night-clear scene when `isDay` is false.

---

## 4. Visual resolution (`lib/sky-visuals.ts` — NEW)

Keeps all look-and-feel decisions out of the data layer and out of JSX. A pure
function the component (and tests) call:

```ts
export type SkyLayer = "sun" | "clouds" | "rain" | "snow" | "stars" | "moon";
export interface SkyVisual {
  key: string;              // stable id, e.g. "sunny-day" — used as data-attr + CSS hook + test anchor
  gradient: string;         // CSS linear-gradient(165deg, …) — matches app's 155–165deg house angle
  layers: SkyLayer[];       // which animated fx to render
  icon: SkyIconKey;         // lucide icon for the header (static, reduced-motion safe)
  cloudTone: "white" | "grey" | "dark";
}
export function resolveSkyVisual(c: SkyCondition, isDay: boolean, coverage: number | null): SkyVisual
```

### Gradient palettes (165° to sit in the app's 155–165° house style)

**Day**
- sunny `#2b86c5 → #5bb4e6 52% → #f6cf6f` · layers `[sun]`
- partly-cloudy `#3a8ec7 → #76b1d6 55% → #c2cfd9` · `[sun, clouds]` (white)
- cloudy `#586a7e → #7e8d9e 55% → #a7b2bf` · `[clouds]` (grey, ×3)
- fog `#6b7884 → #97a3ad 55% → #c2c9cf` · `[clouds]` (grey, low, soft)
- rain `#37475b → #4f6176 55% → #67798e` · `[clouds, rain]`
- pouring `#2c3a4c → #415367 55% → #566b80` · `[clouds, rain]` (more drops)
- snow `#5f7796 → #90a7c1 52% → #c5d4e2` · `[clouds, snow]`
- sleet `#4a5e74 → #71869c 55% → #9fb1c2` · `[clouds, rain, snow]`
- thunder `#2a2f45 → #3c4565 55% → #586089` · `[clouds, rain]` (+optional flash, see §9)
- unknown `#5b6b80 → #8492a3 60% → #aab6c4` · `[]`

**Night** (`isDay === false`)
- clear (from `sunny`) `#0e1733 → #1b2a54 52% → #2b3a64` · `[moon, stars]`
- partly/cloudy/fog `#161d2e → #27303f 55% → #3a4453` · `[clouds]` (dark) + few stars for partly
- rain/pouring `#1e2733 → #2c3947 55% → #3a4856` · `[clouds, rain]`
- snow/sleet `#27344a → #3a4a63 55% → #56688a` · `[clouds, snow]`
- thunder `#191d2e → #262c44 55% → #3a4060` · `[clouds, rain]`
- unknown `#161d2e → #2a3344 60% → #3a4453` · `[]`

### Animations (CSS keyframes in `globals.css`, following the existing pattern)

The file already defines keyframes (`rise`, `vt-*`) with
`@media (prefers-reduced-motion: reduce)` guards and houses component CSS like
`.brightness-slider`. We add, in the same place:

- `@keyframes wx-drift` — clouds translate L→R, ~26–48s, linear, staggered.
- `@keyframes wx-rain` — drop translateY + fade, ~0.9–1.25s.
- `@keyframes wx-snow` — flake translateY + slight X drift + fade, ~4–6s.
- `@keyframes wx-twinkle` — star opacity 0.2↔1, ~3–4.5s.
- `@keyframes wx-sunpulse` — sun glow scale/opacity, 6s.
- `@keyframes wx-spin` — sun rays rotate, 90s.

Particle counts capped: ≤3 clouds, ≤8 drops/flakes, ≤7 stars (cheap; all
GPU-friendly transform/opacity).

---

## 5. Components

### `WeatherBackdrop` (`app/components/WeatherBackdrop.tsx` — NEW, client)

Presentational. Props: `{ visual: SkyVisual }`. Renders, absolutely positioned
inside the (overflow-hidden) Card, behind the data:

1. `fx` layer (`absolute inset-0 -z-0 pointer-events-none overflow-hidden`)
   containing only the layers named in `visual.layers` (sun glow + rays, clouds,
   rain drops, snow flakes, stars, moon).
2. `scrim` (`absolute inset-0 pointer-events-none`):
   `linear-gradient(180deg, rgba(0,0,0,.10), transparent 34%, rgba(0,0,0,.26))`.

Single responsibility: given a resolved visual, paint the animated sky. No data,
no HA, no business logic — trivially testable and reusable.

**Reduced motion:** when `prefers-reduced-motion: reduce`, the particle/fx layer
is not rendered (or renders a single static glyph); the gradient + scrim + header
weather icon remain. Implemented with the same `@media` guard already used in
`globals.css` (particles wrapped in a class that becomes `display:none` under
reduce), so there is no frozen-mid-air particle artifact.

### `SolarCard` (`app/components/SolarCard.tsx` — refactor)

Derive once: `const v = resolveSkyVisual(solar.sky.condition, solar.sky.isDay, solar.sky.cloudCoverage)`.

- Root: `<Card style={{ background: v.gradient }} className="relative overflow-hidden text-white" data-sky={v.key} aria-label={…weather…}>` — exact ChillCard pattern.
- `<WeatherBackdrop visual={v} />` as first child; wrap all existing content in a `relative z-10` stack.
- **Header**: weather icon (white, from `v.icon` via lucide: `Sun`/`CloudSun`/`Cloud`/`CloudFog`/`CloudRain`/`CloudLightning`/`CloudSnow`/`Moon`/`CloudMoon`) + white title; `RangeMenu` trigger restyled to glass (`bg-white/15 text-white hover:bg-white/25`).
- **Big number**: keep `font-display text-5xl`, color white, `kW` suffix `text-white/80`; add `drop-shadow`/text-shadow for contrast.
- **Chart**: same Recharts Area/Bar + same data; restyle for the sky —
  line/stroke `#fff`, area fill white gradient `rgba(255,255,255,.22)→0`,
  `CartesianGrid` + axes `rgba(255,255,255,.18)`, tick fill `rgba(255,255,255,.72)`,
  Tooltip stays the light `var(--card)` popover (dark text on white, pops above
  fine). Chart sits inside a frosted-dark panel.
- **Stats**: extend the existing internal `Stat` with a `glass` prop. Glass =
  `bg-[rgba(13,22,38,0.22)] border border-white/15 backdrop-blur`, label
  `text-white/75`, value `text-white`, info button `text-white/75 hover:text-white`.
  The cost/earnings row uses the same glass. (Export-green / warn-amber accent
  values keep their accent color; verify contrast on dark glass — bump to a
  lighter tint of the accent if needed.)
- **Unavailable** (`!solar.available`): keep the message, but on the
  `unknown` gradient with white text (card still shows a calm sky).

No change to `RangeMenu` data behavior, the history fetch, or the chart's data
shape — only colors and the glass wrappers.

---

## 6. i18n (`lib/i18n.ts`)

Add bilingual keys (EN + NL) for an accessible weather label (used on the card's
`aria-label` / a visually-hidden description so screen-reader + the bilingual
convention are honored):

`weather.sunny`, `weather.partlyCloudy`, `weather.cloudy`, `weather.fog`,
`weather.rain`, `weather.pouring`, `weather.snow`, `weather.sleet`,
`weather.thunder`, `weather.night`, `weather.unknown`.

E.g. `weather.sunny` → EN "Sunny" / NL "Zonnig". Card `aria-label` becomes e.g.
"Zonnepanelen — Zonnig".

---

## 7. Edge cases & fallback

- **Weather entity missing/unavailable** → `condition: "unknown"` → neutral
  gradient, no particles. Card still works (production data unaffected).
- **Sun entity missing** → `isDay: true` (daytime default).
- **Solar unavailable** → existing "Niet beschikbaar" message, on `unknown` sky.
- **cloud_coverage absent** → `null`; visuals fall back to condition-only.

---

## 8. Accessibility & performance

- White text contrast guaranteed by scrim + dark glass + text-shadow across all
  palettes (lightest = snow's `#c5d4e2`, capped; bottom scrim `.26` covers it).
- `prefers-reduced-motion` removes all particle motion; static gradient + header
  weather icon still convey the condition.
- Animations are transform/opacity only, small element counts — negligible cost.
- Header icon + `aria-label` give a non-visual, non-animated weather readout.

---

## 9. Out of scope / optional polish (not in v1)

- Cross-fade transition when the condition changes (instant switch in v1; weather
  changes are rare and `/api/state` polls on an interval).
- Lightning flash for `thunder`.
- Dawn/dusk golden-hour palette driven by `sun.sun` `elevation`.
- `cloud_coverage`-driven cloud count/opacity (use condition only in v1).

Each is a clean follow-up; none blocks v1.

---

## 10. Testing (TDD)

- `lib/state-mapper` test: `mapSky` — each HA raw condition → expected
  `SkyCondition`; `above_horizon`/`below_horizon`/missing → `isDay`;
  missing weather entity → `unknown`; `cloud_coverage` parsed/`null`.
- `lib/sky-visuals.test.ts`: `resolveSkyVisual` — condition+`isDay` → expected
  `key`/layers (e.g. `sunny`+day→`sunny-day` with `[sun]`; `sunny`+night→
  night-clear with `[moon,stars]`; `unknown`→neutral, no layers).
- `app/components/SolarCard.test.tsx`: update the `solar` fixture to include
  `sky`; assert the card exposes the right `data-sky`/weather icon for a couple
  conditions and that data still renders (big number, stats). Mock `matchMedia`
  for the reduced-motion path if asserted.
- Keep `app/api/state/route.test.ts` green (additive nested field).

---

## 11. File-by-file change list

| File | Change |
|---|---|
| `config/devices.ts` | add `WEATHER` (weather + sun entity ids) |
| `lib/types.ts` | add `SkyCondition`, `SkyState`; add `sky` to `SolarState` |
| `lib/state-mapper.ts` | add+export `mapSky(byId)`; call from `mapSolar` |
| `lib/sky-visuals.ts` | **new** — `resolveSkyVisual` + palettes/layers/icons |
| `lib/sky-visuals.test.ts` | **new** — visual resolution tests |
| `app/components/WeatherBackdrop.tsx` | **new** — animated sky + scrim layer |
| `app/globals.css` | add `wx-*` keyframes + particle/scrim classes + reduced-motion guards |
| `app/components/SolarCard.tsx` | gradient bg + backdrop + white/glass data treatment |
| `app/components/SolarCard.test.tsx` | fixture `sky` + backdrop assertions |
| `lib/i18n.ts` | add `weather.*` keys (EN+NL) |

> **Implementation note (AGENTS.md):** this repo's Next.js may diverge from
> training data — before writing code, consult the relevant guide under
> `node_modules/next/dist/docs/` for anything touching client components / global
> CSS, and heed deprecation notices.
