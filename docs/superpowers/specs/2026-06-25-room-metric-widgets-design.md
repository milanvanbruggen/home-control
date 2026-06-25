# Room Metric Widgets — Design

Date: 2026-06-25
Status: Approved (brainstorm)

## Goal

Show configurable per-room environmental widgets on the home screen. Each room
gets one card showing its enabled metrics (temperature, humidity). A new
"Widgets" section in Settings lets the user toggle each metric on/off per room.

## Decisions (from brainstorm)

- **Sensor source:** explicit curated config (`ROOM_METRICS` in `config/devices.ts`),
  prefilled from the real Home Assistant entities. Consistent with the existing
  `ROOMS` / `CHILLS` / `THERMOSTAT` config pattern.
- **Display:** one card per room, metrics side-by-side, placed in the existing
  masonry grid after the climate cards.
- **Metric kinds (now):** `temperature`, `humidity`. Model is extensible so
  illuminance / heating% can be added later with a one-line config entry.
- **Default visibility:** everything ON. Lib uses a **deny-list** so empty
  settings = all visible, and metrics added to config later appear automatically.
- **Outdoor:** include a `buiten` pseudo-room (outdoor temperature).
- **Known redundancies — keep both, user can toggle off (default on):**
  - `Kamer Bas` and `Slaapkamer Bas` are likely the same room via two sensor
    sources → two cards by default.
  - `Woonkamer` temperature overlaps the Thermostat card's current temp.

## Data model (`lib/types.ts`)

```ts
export type MetricKind = "temperature" | "humidity";

export interface MetricSensor {
  kind: MetricKind;
  entityId: string;
}

// A live metric value as sent to the client.
export interface MetricValue {
  kind: MetricKind;
  value: number | null;   // raw reading; null = unavailable/unknown/missing
  unit: string;           // from HA unit_of_measurement, fallback per kind
  visible: boolean;       // server-computed from settings.hiddenMetrics
}

export interface RoomMetrics {
  key: string;
  name: string;
  metrics: MetricValue[];
}

// AppState gains:
interface AppState {
  // ...existing: chills, thermostat, rooms
  metrics: RoomMetrics[];
}

// AppSettings gains a deny-list (roomKey -> hidden metric kinds):
interface AppSettings {
  // ...existing: language, theme, favorites, waterAlert
  hiddenMetrics: Record<string, string[]>;
}
```

`metrics` carries **all** configured rooms/metrics with live values and a
server-computed `visible` flag. Both pages consume the same `/api/state`
payload: the home page renders `visible` ones; Settings renders all with the
toggle reflecting `visible`. No extra endpoint.

## Config (`config/devices.ts`)

```ts
export interface MetricRoom {
  key: string;
  name: string;
  sensors: readonly MetricSensor[];
}

export const METRIC_KINDS: readonly MetricKind[] = ["temperature", "humidity"];

export const ROOM_METRICS: readonly MetricRoom[] = [
  { key: "woonkamer", name: "Woonkamer", sensors: [
    { kind: "temperature", entityId: "sensor.woonkamer_woonkamer_temperature" },
    { kind: "humidity",    entityId: "sensor.woonkamer_woonkamer_humidity" },
  ]},
  { key: "slaapkamer", name: "Slaapkamer", sensors: [
    { kind: "temperature", entityId: "sensor.slaapkamer_maartje_en_milan_slaapkamer_maartje_en_milan_temperature" },
    { kind: "humidity",    entityId: "sensor.slaapkamer_maartje_en_milan_slaapkamer_maartje_en_milan_humidity" },
  ]},
  { key: "slaapkamer_bas", name: "Slaapkamer Bas", sensors: [
    { kind: "temperature", entityId: "sensor.slaapkamer_bas_slaapkamer_bas_temperature" },
    { kind: "humidity",    entityId: "sensor.slaapkamer_bas_slaapkamer_bas_humidity" },
  ]},
  { key: "slaapkamer_thijs", name: "Slaapkamer Thijs", sensors: [
    { kind: "temperature", entityId: "sensor.slaapkamer_thijs_slaapkamer_thijs_temperature" },
    { kind: "humidity",    entityId: "sensor.slaapkamer_thijs_slaapkamer_thijs_humidity" },
  ]},
  { key: "kamer_bas", name: "Kamer Bas", sensors: [
    { kind: "temperature", entityId: "sensor.kamer_bas_temperatuur" },
    { kind: "humidity",    entityId: "sensor.kamer_bas_luchtvochtigheid" },
  ]},
  { key: "zolder", name: "Zolder", sensors: [
    { kind: "temperature", entityId: "sensor.zolder_ambient_temperature" },
  ]},
  { key: "speelkamer", name: "Speelkamer", sensors: [
    { kind: "temperature", entityId: "sensor.speelkamer_ambient_temperature" },
  ]},
  { key: "buiten", name: "Buiten", sensors: [
    { kind: "temperature", entityId: "sensor.home_outdoor_temperature" },
  ]},
];

export const METRIC_ROOM_KEYS: ReadonlySet<string> = new Set(ROOM_METRICS.map((r) => r.key));
```

Metric-room keys share namespace with `ROOMS` keys where they refer to the same
physical room (woonkamer, slaapkamer, slaapkamer_bas, slaapkamer_thijs); the new
keys (kamer_bas, zolder, speelkamer, buiten) are metric-only. Keys only need to
be stable for settings + React.

## State mapping (`lib/state-mapper.ts`)

- New `mapMetrics(byId, hiddenMetrics): RoomMetrics[]`:
  - For each `ROOM_METRICS` room, for each sensor: look up entity by id.
  - `value` = numeric parse of `state` (`Number(state)`); `unavailable`/`unknown`/NaN → `null`.
  - `unit` = `attributes.unit_of_measurement` if string, else fallback (`temperature`→`"°C"`, `humidity`→`"%"`).
  - `visible` = `!(hiddenMetrics[roomKey] ?? []).includes(kind)`.
- `mapHaStatesToAppState(states, activeScenes, favorites, sceneGradients, hiddenMetrics = {})`
  gains a trailing param; returns `{ ...existing, metrics: mapMetrics(byId, hiddenMetrics) }`.

## API

- `app/api/state/route.ts`: hoist `const settings = getSettings()` (currently called
  inline for favorites) and pass both `settings.favorites` and `settings.hiddenMetrics`
  — one read, not two.
- `app/api/settings/route.ts`: add to `patchSchema`:
  `hiddenMetrics: z.record(z.string(), z.array(z.string())).optional()`.

## Settings persistence (`lib/settings-store.ts`)

- `defaults()`: add `hiddenMetrics: {}`.
- `sanitize()`: accept `hiddenMetrics` when it's a plain object; keep only keys in
  `METRIC_ROOM_KEYS`, values filtered to known `METRIC_KINDS` strings.
- `updateSettings()`: merge `hiddenMetrics: patch.hiddenMetrics ?? current.hiddenMetrics`.

## Home UI

- New `app/components/RoomMetricCard.tsx`:
  - Props: `{ room: RoomMetrics }`.
  - Compute `visible = room.metrics.filter(m => m.visible)`; render `null` if empty.
  - Shared `Card`, room name as `<h2>` title, metrics on a flex-wrap row:
    icon (`Thermometer` temp, `Droplets` humidity) + formatted value + unit, with
    a small muted label.
  - Formatting: temperature one decimal, NL comma (reuse the existing `fmt` idiom);
    humidity integer. `value === null` → `—`.
- `app/page.tsx`: after the chills loop, render
  `state.metrics.map((room, i) => <div className="animate-rise mb-4 break-inside-avoid" style={{animationDelay}}><RoomMetricCard room={room} /></div>)`
  inside the existing masonry container, continuing the stagger. Cards returning
  `null` simply don't render.

## Settings UI (`app/settings/page.tsx`)

- New `Card` "Widgets" below Notifications, using `state.metrics` from `/api/state`
  (the page already fetches it for favorites).
- Per room: room name, then a Switch row per metric kind showing the live value
  (e.g. "Temperatuur 21,4°" / "Luchtvochtigheid 48%"). Switch checked = visible.
- On toggle: optimistic local update; rebuild the full `hiddenMetrics` map and
  `PUT /api/settings` debounced (~400 ms), mirroring the favorites flush pattern
  (queue + flush-on-unmount + toast success/error).

## i18n (`lib/i18n.ts`)

Add keys (en / nl):
- `settings.widgets` → "Widgets" / "Widgets"
- `settings.widgetsHint` → "Choose which readings to show per room." / "Kies welke meetwaarden je per kamer toont."
- `metric.temperature` → "Temperature" / "Temperatuur"
- `metric.humidity` → "Humidity" / "Luchtvochtigheid"

Room names come from config (proper nouns, not translated).

## Edge cases / error handling

- Sensor `unavailable`/`unknown`/missing entity → `value: null`, card still shows
  the metric as `—` (so the room stays visible/known).
- All metrics of a room hidden → no card on home.
- No room has a visible metric → no metric cards at all (grid unaffected).
- Stale `hiddenMetrics` keys/kinds (config changed) → dropped by `sanitize`.
- Deny-list semantics: a metric kind newly added to a room's config is visible by
  default even if the user previously edited that room (only explicitly-hidden
  kinds stay hidden).

## Testing

- `config/devices.test.ts`: `ROOM_METRICS` shape — unique keys, kinds ∈ `METRIC_KINDS`,
  entity ids look like `sensor.*`.
- `lib/state-mapper.test.ts`: temperature/humidity mapped from state; `unavailable`
  → null; unit read from attribute with fallback; `visible` reflects `hiddenMetrics`.
- `lib/settings-store.test.ts`: `hiddenMetrics` default `{}`; sanitize keeps valid
  keys/kinds and drops junk; merge preserves on partial patch.
- `app/api/settings/route.test.ts`: schema accepts `hiddenMetrics`.
- `app/components/RoomMetricCard.test.tsx`: renders visible metrics + values;
  returns nothing when all hidden; `—` on null.
- `app/settings/page.test.tsx`: toggling a metric persists the right `hiddenMetrics`.
- Existing 190 tests stay green.

## Files touched

- `lib/types.ts` — metric types + `AppState.metrics` + `AppSettings.hiddenMetrics`
- `config/devices.ts` — `ROOM_METRICS`, `METRIC_KINDS`, `METRIC_ROOM_KEYS`
- `lib/state-mapper.ts` — `mapMetrics` + threaded `hiddenMetrics`
- `app/api/state/route.ts` — pass `hiddenMetrics`
- `lib/settings-store.ts` — defaults / sanitize / merge
- `app/api/settings/route.ts` — schema
- `lib/i18n.ts` — keys
- `app/components/RoomMetricCard.tsx` — new
- `app/page.tsx` — render metric cards in grid
- `app/settings/page.tsx` — Widgets card
- Tests alongside each
