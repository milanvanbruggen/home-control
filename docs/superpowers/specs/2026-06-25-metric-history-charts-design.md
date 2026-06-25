# Metric History + Chart Cards — Design

Date: 2026-06-25
Status: Approved (brainstorm)

## Goal

Sample every configured room metric (temperature, humidity) every 30 minutes,
persist a rolling 30-day history server-side, and turn each home-screen
`RoomMetricCard` into side-by-side line-chart panels (recharts) — temperature
left, humidity right — each showing its current value small above its chart, with
a per-card 24h / 7d / 30d range toggle (default 24h). A card with only one visible
metric is half-width, so two such cards pair up.

Builds on the existing "room metric widgets" feature (`ROOM_METRICS`,
`AppState.metrics`, `hiddenMetrics` visibility).

## Decisions (from brainstorm)

- **Card becomes a graph:** the chart is the primary content; current values are
  small labels in the header.
- **Rendering:** add the `recharts` library, styled to the app.
- **History:** keep 30 days; default view 24h with per-card 24h/7d/30d buttons.
- **Range toggle:** per-card (each card owns its range + fetch; one toggle drives
  both panels).
- **Two side-by-side panels per card:** temperature **left**, humidity **right** —
  each its own single-metric mini line chart with its own y-scale, colour matching
  the metric (temp = heat orange, humidity = ring teal). (Revises the earlier
  "one combined dual-axis chart" — a later layout request.)
- **Card width by visible-metric count:** a card with both metrics visible is
  full-width; a card with only one visible metric is **half-width**, so two
  single-metric cards (e.g. Zolder + Speelkamer) sit side by side. This needs a
  dedicated grid (see Home layout) rather than the shared masonry.

## Storage (`/data/metrics-history.json`)

Single append-only rolling JSON, written via the existing `dataFile()` with an
atomic tmp+rename (same pattern as `settings-store.ts`). Only the sampler writes;
the API route reads. Single writer — no locking needed.

```ts
interface MetricSample {
  t: number;                          // epoch ms
  v: Record<string, number | null>;   // key = `${roomKey}.${kind}`, null = unavailable
}
interface MetricHistory { samples: MetricSample[]; }
```

- Sample keys cover every `ROOM_METRICS` room × its sensor kinds.
- Unavailable/unknown/missing/NaN sensor → `null` (renders as a gap, not 0).
- Retention: prune samples older than 30 days on every write.
- Size: ~13 series × 1440 samples (30d) ≈ a few hundred KB JSON. Bounded by prune.

### Pure logic (`lib/metrics-history.ts`) — separated for testing (like `water-watch.ts`)

```ts
const RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

// Append one sample and drop anything older than `now - RETENTION_MS`.
function appendAndPrune(history: MetricHistory, sample: MetricSample, now: number): MetricHistory;

// Window to [now - rangeMs, now] and downsample to <= maxPoints buckets
// (bucket = time-average of non-null values; null when a bucket is empty).
// 24h returns raw (<=48 pts); 7d/30d downsample to ~150 pts.
function windowAndDownsample(
  samples: MetricSample[], key: string, fromMs: number, now: number, maxPoints: number,
): { t: number; value: number | null }[];

const RANGE_MS: Record<"24h" | "7d" | "30d", number>; // 24h / 7d / 30d in ms
```

### I/O wrapper (`lib/metrics-history-store.ts`) — server-only

```ts
function readHistory(): MetricHistory;                 // parse file; {} → { samples: [] } on missing/corrupt
function writeSample(sample: MetricSample, now: number): void; // read → appendAndPrune → atomic write
```

## Sampler (`lib/metrics-sampler.ts` + `instrumentation.ts`)

- Pure extractor in `lib/metrics-sampler.ts`:
  ```ts
  function sampleFromStates(states: HaEntityState[], now: number): MetricSample;
  ```
  Builds `v["${room.key}.${sensor.kind}"]` for every `ROOM_METRICS` sensor using
  the shared numeric parse (see DRY note below).
- `instrumentation.ts` `register()` adds, alongside the existing 30s water loop, a
  separate **30-minute** `setInterval` (own HMR global guard,
  `__metricsSamplerStarted`). Each tick: `getStates()` → `sampleFromStates` →
  `writeSample`. HA unreachable → skip this tick (no null-spam). Also takes **one
  immediate sample on start** so the chart isn't empty for the first 30 minutes.

### DRY: shared numeric parse

Both `mapMetrics` (in `state-mapper.ts`) and the sampler need the same
"`unavailable`/`unknown`/missing/NaN → null" parse. Extract it to `lib/metrics.ts`:

```ts
function numericState(e: HaEntityState | undefined): number | null;
```

Refactor `mapMetrics` to use it; the sampler uses it too. No behaviour change.

## API (`app/api/history/route.ts`)

`GET /api/history?room=<key>&range=24h|7d|30d`

- Validates `room` ∈ `METRIC_ROOM_KEYS` and `range` ∈ {24h,7d,30d} (else 400).
- `now = Date.now()`; for each sensor kind of that room, `windowAndDownsample`
  with `maxPoints = 48` for 24h (effectively raw) and `150` for 7d/30d.
- Returns:
  ```ts
  {
    room: string;
    range: "24h" | "7d" | "30d";
    series: { kind: MetricKind; unit: string; points: { t: number; value: number | null }[] }[];
  }
  ```
- `unit` resolved the same way as `mapMetrics` (attribute fallback per kind);
  since history stores only numbers, unit comes from the static fallback map
  (`temperature`→`°C`, `humidity`→`%`).
- `export const dynamic = "force-dynamic"`.

## Card redesign (`app/components/RoomMetricCard.tsx`)

The card keeps its visible-metric filtering + null-return-when-empty, and becomes a
**row of one panel per visible metric** (temperature left, humidity right):

- **Header (card-level):** room name + a per-card range toggle `24h · 7d · 30d`
  (small segmented control, default `24h`, local state, drives both panels).
- **Panel (one per visible metric):** a `MetricChartPanel` showing:
  - the metric icon + label + current value (small), from the live `room` prop
    (polled every 3s) — temp heat-orange, humidity teal — via `formatMetricValue`
    + `METRIC_LABEL_KEY`.
  - a single-metric recharts `ResponsiveContainer` + `LineChart` with one `Line`
    (its own y-scale, hidden axis), sparse x-axis time ticks, muted grid, rounded
    line, metric colour, `connectNulls={false}` so unavailable gaps show.
  - Two visible metrics → two panels side by side (`grid grid-cols-2`); one visible
    metric → one panel.
- **Data:** the card fetches `/api/history?room=<key>&range=<range>` once per
  `[room.key, range]` (NOT on the live values — the 3s poll re-renders headers but
  must not refetch history), then hands each kind's `points` to its panel. Loading
  + empty states per panel:
  - while loading → keep the header value, show a subtle placeholder.
  - `< 2` points → value + muted "collecting data…" instead of a chart.

`MetricChartPanel` is a small focused sub-component (icon/label/value + one chart),
so the card just lays out 1–2 of them and owns the range + fetch.

## Home layout — metric grid (`app/page.tsx`)

The metric cards move **out of the shared `columns` masonry** (which can't pair
half-width cards) into their own responsive grid **below** the lights/thermostat/
chills masonry. The climate masonry is otherwise unchanged.

- Container: `grid grid-cols-2 gap-4 md:grid-cols-4 [grid-auto-flow:dense] items-start`.
- Per room with ≥1 visible metric, a grid item:
  - `col-span-2` when **2** metrics are visible (full-width on mobile; half-row on
    md), so its two panels sit side by side.
  - `col-span-1` when **1** metric is visible (half-width on mobile), so two
    single-metric cards pair up. `grid-auto-flow: dense` backfills singles into gaps.
  - keyed by `room.key`, keeps the `animate-rise` stagger.
- The page computes `visibleCount = room.metrics.filter(m => m.visible).length` to
  pick the span and to drop rooms with `visibleCount === 0` (same filter as today,
  now also selecting the span).

## Dependency

Add `recharts` to `package.json`. Client-only import inside `RoomMetricCard`.
Style explicitly (muted axes/grid via CSS vars, accent line colours, no default
recharts chrome) so it matches the app.

## i18n (`lib/i18n.ts`)

Add (en / nl):
- `history.range24h` → "24h" / "24u"
- `history.range7d` → "7d" / "7d"
- `history.range30d` → "30d" / "30d"
- `history.collecting` → "Collecting data…" / "Gegevens verzamelen…"

## Edge cases / error handling

- HA down during a sample tick → tick skipped; no sample written (avoids a null
  row for every sensor).
- History file missing/corrupt → treated as empty `{ samples: [] }`.
- Sensor removed from config → its old points remain in the file but are no longer
  appended; the API only returns series for the room's current sensors.
- A sensor added to config → starts being sampled on the next tick; appears in
  history going forward.
- Timezone: timestamps stored as epoch ms; the chart formats ticks in local time.
- Range with `< 2` usable points (fresh deploy) → card shows the "collecting" state.

## Testing

- `lib/metrics-history.test.ts`: `appendAndPrune` (appends, prunes >30d, given a
  fixed `now`); `windowAndDownsample` (24h raw ≤48 pts; 7d/30d bucket-average to
  ≤150; null buckets stay null; values outside the window excluded).
- `lib/metrics-sampler.test.ts`: `sampleFromStates` builds the right keys and maps
  unavailable/unknown/missing → null, real numbers through.
- `lib/metrics.test.ts`: `numericState` parse cases (extends existing file).
- `lib/state-mapper.test.ts`: still green after the `numericState` refactor
  (no behaviour change).
- `app/api/history/route.test.ts`: valid room+range returns shaped series; bad
  room/range → 400; reads via `DATA_DIR`/a temp file like `settings-store.test.ts`.
- `app/components/RoomMetricCard.test.tsx`: header current values still render;
  one panel per visible metric (two visible → two panels temp+humidity; one
  visible → one panel); range toggle present and switching triggers a fetch with
  the right query; `< 2` points → "collecting" state. (Do not assert recharts SVG
  internals in jsdom — mock `fetch`; assert the data wiring + labels + panels +
  toggle, not chart paths.)
- Home grid span: extract the span choice into a tiny pure helper
  (`metricCardSpan(visibleCount): "col-span-1" | "col-span-2"`) and unit-test it
  (1 → half, ≥2 → full); the grid container itself is verified by lint + build
  (no home-page test harness).
- Existing 209 tests stay green.

## Files touched

- `package.json` — add `recharts`
- `lib/metrics.ts` — add `numericState`
- `lib/state-mapper.ts` — use `numericState` in `mapMetrics` (no behaviour change)
- `lib/metrics-history.ts` — new (pure: append/prune/window/downsample, RANGE_MS)
- `lib/metrics-history-store.ts` — new (server I/O: read/writeSample)
- `lib/metrics-sampler.ts` — new (pure `sampleFromStates`)
- `instrumentation.ts` — add the 30-min sampler interval + immediate first sample
- `app/api/history/route.ts` — new
- `app/components/RoomMetricCard.tsx` — redesigned to a two-panel chart card
  (incl. the `MetricChartPanel` sub-component and the `metricCardSpan` helper)
- `app/page.tsx` — move metric cards into their own responsive grid (span by
  visible-metric count) below the climate masonry
- `lib/i18n.ts` — range + collecting keys
- Tests alongside each
