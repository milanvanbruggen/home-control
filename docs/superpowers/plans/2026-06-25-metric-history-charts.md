# Metric History + Chart Cards Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sample every room metric every 30 min into a rolling 30-day history, and render each home metric card as two side-by-side recharts line panels (temp left, humidity right) with a per-card 24h/7d/30d range toggle; single-metric cards are half-width.

**Architecture:** A 30-min `setInterval` in `instrumentation.ts` reads HA states, builds a sample, and appends it (atomic write, prune >30d) to `/data/metrics-history.json`. Pure logic (history append/prune/window/downsample, sample extraction) lives in testable modules. A `GET /api/history` route serves windowed/downsampled series. `RoomMetricCard` fetches its series and renders one `recharts` `LineChart` panel per visible metric; the home page lays metric cards in a dedicated grid that spans 2 cols for two-metric rooms and 1 for single-metric rooms.

**Tech Stack:** Next.js (App Router), TypeScript, Tailwind v4, **recharts 3.x** (new dep), Node fs (atomic write), Vitest + Testing Library.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-06-25-metric-history-charts-design.md`.
- **One new dependency only: `recharts`.** No others.
- Sampling interval: **30 minutes** (`30 * 60 * 1000`); plus one immediate sample on server start.
- Retention: **30 days**; prune on every write.
- History file: `metrics-history.json` in `dataDir()`; sample key = `` `${roomKey}.${kind}` ``; unavailable/unknown/missing/NaN → `null`.
- Atomic write: tmp file + `renameSync` (same as `lib/settings-store.ts`).
- Ranges: `24h | 7d | 30d`; default `24h`. Downsample caps: 24h→48 points (raw), 7d/30d→150.
- Metric colours: temperature `#f0913f` (`--accent-heat`), humidity `#3aa6dd` (`--ring`).
- Card: two metrics visible → full-width (`col-span-2`) card with two side-by-side panels; one visible → half-width (`col-span-1`).
- Commit messages end with:
  ```
  Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01BPUtdakJE9JBe1QUhtL51h
  ```
- Tests: TDD. Existing 209 tests stay green. Single file: `npx vitest run <path>`. Suite: `npm test`. Lint: `npx eslint <path>`. Types: `npx tsc --noEmit -p tsconfig.json`. Build: `npm run build`.
- Do NOT assert recharts SVG internals in jsdom (ResponsiveContainer measures 0 there) — assert data wiring, labels, panels, toggle, loading/empty states.

---

### Task 1: `numericState` + `METRIC_UNIT_FALLBACK` (DRY), refactor `mapMetrics`

**Files:**
- Modify: `lib/metrics.ts`
- Modify: `lib/state-mapper.ts`
- Test: `lib/metrics.test.ts`

**Interfaces:**
- Consumes: `HaEntityState`, `MetricKind` from `@/lib/types`.
- Produces: `numericState(e: HaEntityState | undefined): number | null` and `METRIC_UNIT_FALLBACK: Record<MetricKind, string>` from `@/lib/metrics`.

- [ ] **Step 1: Failing tests** — append to `lib/metrics.test.ts`:

```ts
import { numericState, METRIC_UNIT_FALLBACK } from "@/lib/metrics";
import type { HaEntityState } from "@/lib/types";

function ent(state: string, attrs: Record<string, unknown> = {}): HaEntityState {
  return { entity_id: "sensor.x", state, attributes: attrs };
}

describe("numericState", () => {
  it("parses a numeric state", () => {
    expect(numericState(ent("21.4"))).toBe(21.4);
    expect(numericState(ent("48"))).toBe(48);
  });
  it("returns null for unavailable/unknown/missing/non-numeric", () => {
    expect(numericState(ent("unavailable"))).toBeNull();
    expect(numericState(ent("unknown"))).toBeNull();
    expect(numericState(undefined)).toBeNull();
    expect(numericState(ent("warm"))).toBeNull();
  });
});

describe("METRIC_UNIT_FALLBACK", () => {
  it("maps kinds to default units", () => {
    expect(METRIC_UNIT_FALLBACK).toEqual({ temperature: "°C", humidity: "%" });
  });
});
```

- [ ] **Step 2: Run, expect FAIL** — `npx vitest run lib/metrics.test.ts` → fails (not exported).

- [ ] **Step 3: Implement in `lib/metrics.ts`** — add the import and the two exports:

```ts
import type { HaEntityState, MetricKind, MetricValue } from "@/lib/types";
import type { MsgKey } from "@/lib/i18n";

/** Default unit per metric kind, when HA gives no unit_of_measurement. */
export const METRIC_UNIT_FALLBACK: Record<MetricKind, string> = { temperature: "°C", humidity: "%" };

/** Numeric reading of an HA entity, or null when unavailable/unknown/missing/non-numeric. */
export function numericState(e: HaEntityState | undefined): number | null {
  if (!e || e.state === "unavailable" || e.state === "unknown") return null;
  const n = Number(e.state);
  return Number.isNaN(n) ? null : n;
}
```

(Replace the existing first import line of `lib/metrics.ts` — `import type { MetricKind, MetricValue } from "@/lib/types";` — with the `HaEntityState, MetricKind, MetricValue` form above. Keep the existing `METRIC_LABEL_KEY` and `formatMetricValue`.)

- [ ] **Step 4: Refactor `lib/state-mapper.ts` to use them.**

Change the metrics import line to add `numericState, METRIC_UNIT_FALLBACK`:

```ts
import { sceneKey } from "@/lib/hue-color";
import { numericState, METRIC_UNIT_FALLBACK } from "@/lib/metrics";
```

Delete the local `const METRIC_UNIT_FALLBACK: Record<MetricKind, string> = ...` line. Replace the body of the `room.sensors.map((s) => { ... })` in `mapMetrics` with:

```ts
    const metrics: MetricValue[] = room.sensors.map((s) => {
      const e = byId.get(s.entityId);
      const value = numericState(e);
      const unitAttr = e?.attributes.unit_of_measurement;
      const unit = typeof unitAttr === "string" ? unitAttr : METRIC_UNIT_FALLBACK[s.kind];
      return { kind: s.kind, value, unit, visible: !hiddenKinds.includes(s.kind) };
    });
```

- [ ] **Step 5: Run** — `npx vitest run lib/metrics.test.ts lib/state-mapper.test.ts` → PASS (behaviour unchanged). Then `npx tsc --noEmit -p tsconfig.json` → clean.

- [ ] **Step 6: Commit** — `git add lib/metrics.ts lib/metrics.test.ts lib/state-mapper.ts && git commit` (message + trailer).

---

### Task 2: History pure logic (`lib/metrics-history.ts`)

**Files:**
- Create: `lib/metrics-history.ts`
- Test: `lib/metrics-history.test.ts`

**Interfaces:**
- Produces: `MetricSample { t: number; v: Record<string, number|null> }`; `MetricHistory { samples: MetricSample[] }`; `RANGE_MS: Record<"24h"|"7d"|"30d", number>`; `RETENTION_MS: number`; `appendAndPrune(history, sample, now): MetricHistory`; `windowAndDownsample(samples, key, fromMs, now, maxPoints): { t: number; value: number|null }[]`.

- [ ] **Step 1: Failing tests** — create `lib/metrics-history.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { appendAndPrune, windowAndDownsample, RETENTION_MS, RANGE_MS } from "@/lib/metrics-history";
import type { MetricHistory } from "@/lib/metrics-history";

const NOW = 1_700_000_000_000;

describe("appendAndPrune", () => {
  it("appends a sample and drops anything older than 30 days", () => {
    const old = { t: NOW - RETENTION_MS - 1, v: { "a.temperature": 1 } };
    const recent = { t: NOW - 1000, v: { "a.temperature": 2 } };
    const next = appendAndPrune({ samples: [old, recent] }, { t: NOW, v: { "a.temperature": 3 } }, NOW);
    expect(next.samples.map((s) => s.t)).toEqual([recent.t, NOW]);
  });
});

describe("windowAndDownsample", () => {
  const samples: MetricHistory["samples"] = [
    { t: NOW - 3000, v: { "a.temperature": 10 } },
    { t: NOW - 2000, v: { "a.temperature": 20 } },
    { t: NOW - 1000, v: { "a.temperature": null } },
    { t: NOW - 10 * 60 * 60 * 1000, v: { "a.temperature": 99 } }, // 10h ago, outside a 1h window
  ];

  it("returns raw points within the window when under maxPoints", () => {
    const from = NOW - 60 * 60 * 1000; // 1h
    const pts = windowAndDownsample(samples, "a.temperature", from, NOW, 48);
    expect(pts).toEqual([
      { t: NOW - 3000, value: 10 },
      { t: NOW - 2000, value: 20 },
      { t: NOW - 1000, value: null },
    ]);
  });

  it("uses null when the key is missing in a sample", () => {
    const pts = windowAndDownsample([{ t: NOW - 1000, v: { "b.humidity": 5 } }], "a.temperature", NOW - 5000, NOW, 48);
    expect(pts).toEqual([{ t: NOW - 1000, value: null }]);
  });

  it("downsamples to maxPoints buckets, averaging non-null values", () => {
    const from = NOW - 10_000;
    const many = Array.from({ length: 100 }, (_, i) => ({ t: from + i * 100, v: { "a.temperature": i } }));
    const pts = windowAndDownsample(many, "a.temperature", from, NOW, 10);
    expect(pts).toHaveLength(10);
    expect(pts.every((p) => p.value !== null)).toBe(true);
    expect(pts[0].value).toBeLessThan(pts[9].value!); // increasing buckets
  });
});
```

- [ ] **Step 2: Run, expect FAIL** — `npx vitest run lib/metrics-history.test.ts`.

- [ ] **Step 3: Implement `lib/metrics-history.ts`:**

```ts
export interface MetricSample {
  t: number;                          // epoch ms
  v: Record<string, number | null>;   // key = `${roomKey}.${kind}`
}
export interface MetricHistory {
  samples: MetricSample[];
}

export const RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

export const RANGE_MS: Record<"24h" | "7d" | "30d", number> = {
  "24h": 24 * 60 * 60 * 1000,
  "7d": 7 * 24 * 60 * 60 * 1000,
  "30d": 30 * 24 * 60 * 60 * 1000,
};

/** Append one sample, then drop anything older than `now - RETENTION_MS`. */
export function appendAndPrune(history: MetricHistory, sample: MetricSample, now: number): MetricHistory {
  const cutoff = now - RETENTION_MS;
  return { samples: [...history.samples, sample].filter((s) => s.t >= cutoff) };
}

/** Window to [fromMs, now] for one series key; downsample to <= maxPoints buckets
 *  (time-averaged, null when a bucket has no non-null value). */
export function windowAndDownsample(
  samples: MetricSample[],
  key: string,
  fromMs: number,
  now: number,
  maxPoints: number,
): { t: number; value: number | null }[] {
  const points = samples
    .filter((s) => s.t >= fromMs && s.t <= now)
    .map((s) => ({ t: s.t, value: key in s.v ? s.v[key] : null }));
  if (points.length <= maxPoints) return points;

  const span = now - fromMs || 1;
  const buckets = Array.from({ length: maxPoints }, () => ({ sum: 0, count: 0 }));
  for (const p of points) {
    let idx = Math.floor(((p.t - fromMs) / span) * maxPoints);
    if (idx < 0) idx = 0;
    if (idx >= maxPoints) idx = maxPoints - 1;
    if (p.value != null) {
      buckets[idx].sum += p.value;
      buckets[idx].count += 1;
    }
  }
  return buckets.map((b, i) => ({
    t: Math.round(fromMs + ((i + 0.5) / maxPoints) * span),
    value: b.count > 0 ? Math.round((b.sum / b.count) * 10) / 10 : null,
  }));
}
```

- [ ] **Step 4: Run** — `npx vitest run lib/metrics-history.test.ts` → PASS.

- [ ] **Step 5: Commit** — `git add lib/metrics-history.ts lib/metrics-history.test.ts && git commit`.

---

### Task 3: History store I/O (`lib/metrics-history-store.ts`)

**Files:**
- Create: `lib/metrics-history-store.ts`
- Test: `lib/metrics-history-store.test.ts`

**Interfaces:**
- Consumes: `appendAndPrune`, `MetricHistory`, `MetricSample` (Task 2); `dataFile` from `@/lib/data-dir`.
- Produces: `readHistory(): MetricHistory`; `writeSample(sample: MetricSample, now: number): void`.

- [ ] **Step 1: Failing tests** — create `lib/metrics-history-store.test.ts` (mirrors `settings-store.test.ts`, but uses `DATA_DIR`):

```ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { readHistory, writeSample } from "@/lib/metrics-history-store";
import { RETENTION_MS } from "@/lib/metrics-history";

let dir: string;
let n = 0;
const NOW = 1_700_000_000_000;

beforeEach(() => {
  dir = path.join(os.tmpdir(), `metrics-hist-${process.pid}-${n++}`);
  fs.mkdirSync(dir, { recursive: true });
  process.env.DATA_DIR = dir;
});
afterEach(() => {
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ }
  delete process.env.DATA_DIR;
});

describe("metrics-history-store", () => {
  it("returns empty history when no file exists", () => {
    expect(readHistory()).toEqual({ samples: [] });
  });

  it("writes a sample and reads it back, pruning >30d", () => {
    writeSample({ t: NOW - RETENTION_MS - 1, v: { "woonkamer.temperature": 9 } }, NOW - RETENTION_MS - 1);
    writeSample({ t: NOW, v: { "woonkamer.temperature": 21.4 } }, NOW);
    const h = readHistory();
    expect(h.samples.map((s) => s.t)).toEqual([NOW]); // old one pruned on the second write
    expect(h.samples[0].v["woonkamer.temperature"]).toBe(21.4);
  });

  it("treats a corrupt file as empty", () => {
    fs.writeFileSync(path.join(dir, "metrics-history.json"), "{not json");
    expect(readHistory()).toEqual({ samples: [] });
  });
});
```

- [ ] **Step 2: Run, expect FAIL** — `npx vitest run lib/metrics-history-store.test.ts`.

- [ ] **Step 3: Implement `lib/metrics-history-store.ts`:**

```ts
import fs from "node:fs";
import path from "node:path";
import { dataFile } from "@/lib/data-dir";
import { appendAndPrune, type MetricHistory, type MetricSample } from "@/lib/metrics-history";

// Server-only: rolling metric history as JSON on the writable data volume.
const FILE = "metrics-history.json";

export function readHistory(): MetricHistory {
  try {
    const raw = JSON.parse(fs.readFileSync(dataFile(FILE), "utf8")) as unknown;
    if (raw && typeof raw === "object" && Array.isArray((raw as MetricHistory).samples)) {
      return { samples: (raw as MetricHistory).samples };
    }
    return { samples: [] };
  } catch {
    return { samples: [] };
  }
}

export function writeSample(sample: MetricSample, now: number): void {
  const next = appendAndPrune(readHistory(), sample, now);
  const file = dataFile(FILE);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(next), "utf8");
  fs.renameSync(tmp, file);
}
```

- [ ] **Step 4: Run** — `npx vitest run lib/metrics-history-store.test.ts` → PASS.

- [ ] **Step 5: Commit.**

---

### Task 4: Sampler extractor (`lib/metrics-sampler.ts`)

**Files:**
- Create: `lib/metrics-sampler.ts`
- Test: `lib/metrics-sampler.test.ts`

**Interfaces:**
- Consumes: `numericState` (Task 1); `ROOM_METRICS` from `@/config/devices`; `MetricSample` (Task 2); `HaEntityState`.
- Produces: `sampleFromStates(states: HaEntityState[], now: number): MetricSample`.

- [ ] **Step 1: Failing test** — create `lib/metrics-sampler.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { sampleFromStates } from "@/lib/metrics-sampler";
import type { HaEntityState } from "@/lib/types";

const NOW = 1_700_000_000_000;

describe("sampleFromStates", () => {
  it("builds `${roomKey}.${kind}` keys with numeric values, null for unavailable/missing", () => {
    const states: HaEntityState[] = [
      { entity_id: "sensor.woonkamer_woonkamer_temperature", state: "21.4", attributes: {} },
      { entity_id: "sensor.woonkamer_woonkamer_humidity", state: "unavailable", attributes: {} },
    ];
    const sample = sampleFromStates(states, NOW);
    expect(sample.t).toBe(NOW);
    expect(sample.v["woonkamer.temperature"]).toBe(21.4);
    expect(sample.v["woonkamer.humidity"]).toBeNull();
    // a configured sensor with no matching state is present and null
    expect(sample.v["zolder.temperature"]).toBeNull();
    // keys exist for every configured room/sensor
    expect(Object.keys(sample.v)).toContain("buiten.temperature");
  });
});
```

- [ ] **Step 2: Run, expect FAIL.**

- [ ] **Step 3: Implement `lib/metrics-sampler.ts`:**

```ts
import type { HaEntityState } from "@/lib/types";
import { ROOM_METRICS } from "@/config/devices";
import { numericState } from "@/lib/metrics";
import type { MetricSample } from "@/lib/metrics-history";

/** One timestamped sample of every configured room metric. */
export function sampleFromStates(states: HaEntityState[], now: number): MetricSample {
  const byId = new Map(states.map((s) => [s.entity_id, s] as const));
  const v: Record<string, number | null> = {};
  for (const room of ROOM_METRICS) {
    for (const s of room.sensors) {
      v[`${room.key}.${s.kind}`] = numericState(byId.get(s.entityId));
    }
  }
  return { t: now, v };
}
```

- [ ] **Step 4: Run** → PASS.

- [ ] **Step 5: Commit.**

---

### Task 5: Wire the 30-min sampler into `instrumentation.ts`

**Files:**
- Modify: `instrumentation.ts`

**Interfaces:**
- Consumes: `getStates` (already imported), `sampleFromStates` (Task 4), `writeSample` (Task 3).
- Produces: a 30-minute sampling loop + one immediate sample, started regardless of whether any water sensors exist.

- [ ] **Step 1: Add the sampler imports** — extend the existing `Promise.all([...])` destructure in `register()` to also import the sampler + store. Change it to:

```ts
  const [{ getStates, callService }, { CHILLS, WATER_ALERT }, { roomsNewlyWarning, allCleared }, { waterAlertNotify }, { getSettings }, { sampleFromStates }, { writeSample }] =
    await Promise.all([
      import("@/lib/ha-client"),
      import("@/config/devices"),
      import("@/lib/water-watch"),
      import("@/lib/water-alert"),
      import("@/lib/settings-store"),
      import("@/lib/metrics-sampler"),
      import("@/lib/metrics-history-store"),
    ]);
```

- [ ] **Step 2: Start the sampler before the water-sensor early return.**

Immediately AFTER that `Promise.all` block and BEFORE `const sensors = CHILLS.filter(...)`, insert:

```ts
  // Metric history: sample every configured room metric every 30 min (+ once now),
  // independent of the water watcher. HA hiccups skip a tick rather than write nulls.
  async function sampleMetrics(): Promise<void> {
    let states;
    try {
      states = await getStates();
    } catch {
      return; // HA momentarily unreachable — try again next tick
    }
    const now = Date.now();
    try {
      writeSample(sampleFromStates(states, now), now);
    } catch {
      // disk issue — skip this sample, next tick retries
    }
  }
  void sampleMetrics(); // immediate first sample so the chart isn't empty for 30 min
  setInterval(() => void sampleMetrics(), 30 * 60 * 1000);
```

(Leave the rest of `register()` — the water-sensor list, its early return, and the 30s water `setInterval` — unchanged.)

- [ ] **Step 3: Verify** — no unit test (this is the once-per-boot wiring hook, like the existing water loop). Run:
  - `npx eslint instrumentation.ts` → clean
  - `npx tsc --noEmit -p tsconfig.json` → clean
  - `npm test` → 209 still green (nothing imports the changed wiring in tests)

- [ ] **Step 4: Commit.**

---

### Task 6: `GET /api/history` route

**Files:**
- Create: `app/api/history/route.ts`
- Test: `app/api/history/route.test.ts`

**Interfaces:**
- Consumes: `readHistory` (Task 3); `windowAndDownsample`, `RANGE_MS` (Task 2); `ROOM_METRICS`, `METRIC_ROOM_KEYS` from `@/config/devices`; `METRIC_UNIT_FALLBACK` (Task 1).
- Produces: `GET(req: Request)` returning `{ room, range, series: { kind, unit, points: {t,value}[] }[] }`, or 400.

- [ ] **Step 1: Failing test** — create `app/api/history/route.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { GET } from "@/app/api/history/route";
import { writeSample } from "@/lib/metrics-history-store";

let dir: string;
let n = 0;

beforeEach(() => {
  dir = path.join(os.tmpdir(), `hist-route-${process.pid}-${n++}`);
  fs.mkdirSync(dir, { recursive: true });
  process.env.DATA_DIR = dir;
});
afterEach(() => {
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ }
  delete process.env.DATA_DIR;
});

function req(qs: string): Request {
  return new Request(`http://localhost/api/history?${qs}`);
}

describe("GET /api/history", () => {
  it("returns series for a valid room + range", async () => {
    const now = Date.now();
    writeSample({ t: now - 1000, v: { "woonkamer.temperature": 21.4, "woonkamer.humidity": 48 } }, now - 1000);
    writeSample({ t: now - 500, v: { "woonkamer.temperature": 21.6, "woonkamer.humidity": 47 } }, now - 500);
    const res = await GET(req("room=woonkamer&range=24h"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.room).toBe("woonkamer");
    const temp = body.series.find((s: { kind: string }) => s.kind === "temperature");
    expect(temp.unit).toBe("°C");
    expect(temp.points.length).toBeGreaterThanOrEqual(2);
    expect(temp.points.at(-1).value).toBe(21.6);
  });

  it("400s an unknown room or bad range", async () => {
    expect((await GET(req("room=garage&range=24h"))).status).toBe(400);
    expect((await GET(req("room=woonkamer&range=99y"))).status).toBe(400);
  });
});
```

- [ ] **Step 2: Run, expect FAIL.**

- [ ] **Step 3: Implement `app/api/history/route.ts`:**

```ts
import { readHistory } from "@/lib/metrics-history-store";
import { windowAndDownsample, RANGE_MS } from "@/lib/metrics-history";
import { ROOM_METRICS, METRIC_ROOM_KEYS } from "@/config/devices";
import { METRIC_UNIT_FALLBACK } from "@/lib/metrics";

export const dynamic = "force-dynamic";

const RANGES = ["24h", "7d", "30d"] as const;
type Range = (typeof RANGES)[number];

export async function GET(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const room = url.searchParams.get("room") ?? "";
  const range = url.searchParams.get("range") ?? "";
  if (!METRIC_ROOM_KEYS.has(room) || !(RANGES as readonly string[]).includes(range)) {
    return Response.json({ error: "bad_request" }, { status: 400 });
  }
  const cfg = ROOM_METRICS.find((r) => r.key === room)!;
  const now = Date.now();
  const fromMs = now - RANGE_MS[range as Range];
  const maxPoints = range === "24h" ? 48 : 150;
  const samples = readHistory().samples;
  const series = cfg.sensors.map((s) => ({
    kind: s.kind,
    unit: METRIC_UNIT_FALLBACK[s.kind],
    points: windowAndDownsample(samples, `${room}.${s.kind}`, fromMs, now, maxPoints),
  }));
  return Response.json({ room, range, series });
}
```

- [ ] **Step 4: Run** → PASS. Then `npx tsc --noEmit -p tsconfig.json` → clean.

- [ ] **Step 5: Commit.**

---

### Task 7: i18n keys

**Files:**
- Modify: `lib/i18n.ts`

**Interfaces:**
- Produces: `MsgKey` gains `history.range24h`, `history.range7d`, `history.range30d`, `history.collecting`.

- [ ] **Step 1: Add to the `en` map** (e.g. after `"settings.saved"`):

```ts
  "history.range24h": "24h",
  "history.range7d": "7d",
  "history.range30d": "30d",
  "history.collecting": "Collecting data…",
```

- [ ] **Step 2: Add the matching entries to the `nl` map:**

```ts
  "history.range24h": "24u",
  "history.range7d": "7d",
  "history.range30d": "30d",
  "history.collecting": "Gegevens verzamelen…",
```

- [ ] **Step 3: Verify** — `npx vitest run lib/i18n.test.ts && npx tsc --noEmit -p tsconfig.json` → PASS (nl is `Record<MsgKey,string>`, so a missing key is a type error).

- [ ] **Step 4: Commit.**

---

### Task 8: recharts + redesign `RoomMetricCard` into two chart panels

**Files:**
- Modify: `package.json` (+ lockfile) — add `recharts`
- Modify: `app/components/RoomMetricCard.tsx`
- Test: `app/components/RoomMetricCard.test.tsx`

**Interfaces:**
- Consumes: `RoomMetrics`, `MetricValue`, `MetricKind` (`@/lib/types`); `formatMetricValue`, `METRIC_LABEL_KEY` (`@/lib/metrics`); `MsgKey` (`@/lib/i18n`); `GET /api/history` (Task 6); recharts.
- Produces: `RoomMetricCard({ room })` — one chart panel per visible metric, a per-card range toggle, history fetch keyed on `[room.key, range]`.

- [ ] **Step 1: Install recharts**

Run: `npm install recharts`
Expected: `recharts` added to `package.json` dependencies; lockfile updated.

- [ ] **Step 2: Rewrite the failing test** — replace `app/components/RoomMetricCard.test.tsx` entirely (it now mocks `fetch`, since the card fetches history on mount):

```tsx
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render as rtlRender, screen, fireEvent, waitFor } from "@testing-library/react";
import type { ReactElement, ReactNode } from "react";
import { RoomMetricCard } from "@/app/components/RoomMetricCard";
import { LanguageProvider } from "@/app/components/LanguageProvider";
import type { RoomMetrics } from "@/lib/types";

function NL({ children }: { children: ReactNode }) {
  return <LanguageProvider initial="nl">{children}</LanguageProvider>;
}
const render = (ui: ReactElement) => rtlRender(ui, { wrapper: NL });

const room: RoomMetrics = {
  key: "woonkamer", name: "Woonkamer",
  metrics: [
    { kind: "temperature", value: 21.4, unit: "°C", visible: true },
    { kind: "humidity", value: 48, unit: "%", visible: true },
  ],
};

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  // Empty series → both panels show the "collecting" state (no recharts in jsdom).
  fetchMock = vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve({ series: [] }) }));
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

describe("RoomMetricCard", () => {
  it("renders the room name, both metric values and Dutch labels", async () => {
    render(<RoomMetricCard room={room} />);
    expect(screen.getByText("Woonkamer")).toBeInTheDocument();
    expect(screen.getByText("21,4°C")).toBeInTheDocument();
    expect(screen.getByText("48%")).toBeInTheDocument();
    expect(screen.getByText("Temperatuur")).toBeInTheDocument();
    expect(screen.getByText("Luchtvochtigheid")).toBeInTheDocument();
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
  });

  it("fetches history for the room and default 24h range", async () => {
    render(<RoomMetricCard room={room} />);
    await waitFor(() => {
      const url = fetchMock.mock.calls[0][0] as string;
      expect(url).toContain("/api/history?room=woonkamer");
      expect(url).toContain("range=24h");
    });
  });

  it("refetches with the chosen range when a range button is clicked", async () => {
    render(<RoomMetricCard room={room} />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    fireEvent.click(screen.getByRole("radio", { name: "7d" }));
    await waitFor(() => {
      const last = fetchMock.mock.calls.at(-1)![0] as string;
      expect(last).toContain("range=7d");
    });
  });

  it("shows the collecting state when there is too little history", async () => {
    render(<RoomMetricCard room={room} />);
    await waitFor(() => expect(screen.getAllByText("Gegevens verzamelen…").length).toBe(2));
  });

  it("renders one panel when only one metric is visible", async () => {
    render(<RoomMetricCard room={{ key: "zolder", name: "Zolder", metrics: [
      { kind: "temperature", value: 23.1, unit: "°C", visible: true },
      { kind: "humidity", value: 50, unit: "%", visible: false },
    ] }} />);
    expect(screen.getByText("23,1°C")).toBeInTheDocument();
    expect(screen.queryByText("Luchtvochtigheid")).toBeNull();
    await waitFor(() => expect(screen.getAllByText("Gegevens verzamelen…").length).toBe(1));
  });

  it("renders nothing (and does not fetch) when no metric is visible", () => {
    const { container } = render(<RoomMetricCard room={{ ...room, metrics: [
      { kind: "temperature", value: 21.4, unit: "°C", visible: false },
    ] }} />);
    expect(container).toBeEmptyDOMElement();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 3: Run, expect FAIL** — `npx vitest run app/components/RoomMetricCard.test.tsx`.

- [ ] **Step 4: Rewrite `app/components/RoomMetricCard.tsx`:**

```tsx
"use client";
import { useEffect, useState } from "react";
import { Thermometer, Droplets } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, ResponsiveContainer } from "recharts";
import type { RoomMetrics, MetricValue, MetricKind } from "@/lib/types";
import type { MsgKey } from "@/lib/i18n";
import { Card } from "@/app/components/ui/card";
import { useT } from "@/app/components/LanguageProvider";
import { formatMetricValue, METRIC_LABEL_KEY } from "@/lib/metrics";

type Range = "24h" | "7d" | "30d";
type Point = { t: number; value: number | null };
type Series = { kind: MetricKind; unit: string; points: Point[] };

const RANGES: Range[] = ["24h", "7d", "30d"];
const RANGE_LABEL_KEY: Record<Range, MsgKey> = {
  "24h": "history.range24h",
  "7d": "history.range7d",
  "30d": "history.range30d",
};
const KIND_COLOR: Record<MetricKind, string> = { temperature: "#f0913f", humidity: "#3aa6dd" };

function MetricChartPanel({ metric, points, loading }: { metric: MetricValue; points: Point[] | null; loading: boolean }) {
  const t = useT();
  const Icon = metric.kind === "temperature" ? Thermometer : Droplets;
  const color = KIND_COLOR[metric.kind];
  const usable = (points ?? []).filter((p) => p.value != null);

  return (
    <div className="min-w-0">
      <div className="flex items-center gap-2">
        <Icon size={18} aria-hidden style={{ color }} />
        <p className="font-display text-xl font-semibold leading-none tabular-nums">{formatMetricValue(metric)}</p>
        <p className="text-xs text-[var(--muted)]">{t(METRIC_LABEL_KEY[metric.kind])}</p>
      </div>
      <div className="mt-2 h-24">
        {loading || usable.length < 2 ? (
          <div className="flex h-full items-center justify-center text-xs text-[var(--muted)]">
            {loading ? "" : t("history.collecting")}
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={points!} margin={{ top: 4, right: 6, bottom: 0, left: 6 }}>
              <XAxis dataKey="t" type="number" domain={["dataMin", "dataMax"]} hide />
              <YAxis domain={["dataMin - 1", "dataMax + 1"]} hide />
              <Line type="monotone" dataKey="value" stroke={color} strokeWidth={2} dot={false} isAnimationActive={false} connectNulls={false} />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}

export function RoomMetricCard({ room }: { room: RoomMetrics }) {
  const t = useT();
  const visible = room.metrics.filter((m) => m.visible);
  const [range, setRange] = useState<Range>("24h");
  const [series, setSeries] = useState<Series[] | null>(null);

  useEffect(() => {
    if (visible.length === 0) return;
    let alive = true;
    setSeries(null);
    fetch(`/api/history?room=${encodeURIComponent(room.key)}&range=${range}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("bad"))))
      .then((d: { series?: Series[] }) => { if (alive) setSeries(d.series ?? []); })
      .catch(() => { if (alive) setSeries([]); });
    return () => { alive = false; };
  }, [room.key, range, visible.length]);

  if (visible.length === 0) return null;

  return (
    <Card aria-label={room.name}>
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-lg font-semibold tracking-tight">{room.name}</h2>
        <div role="radiogroup" aria-label={room.name} className="flex rounded-full bg-foreground/[0.06] p-0.5 text-xs">
          {RANGES.map((r) => {
            const active = r === range;
            return (
              <button
                key={r}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => setRange(r)}
                className={`rounded-full px-2.5 py-1 font-medium transition ${active ? "bg-[var(--card)] text-foreground shadow-sm" : "text-[var(--muted)]"}`}
              >
                {t(RANGE_LABEL_KEY[r])}
              </button>
            );
          })}
        </div>
      </div>
      <div className={`mt-3 grid gap-4 ${visible.length >= 2 ? "grid-cols-2" : "grid-cols-1"}`}>
        {visible.map((m) => (
          <MetricChartPanel
            key={m.kind}
            metric={m}
            points={series?.find((s) => s.kind === m.kind)?.points ?? null}
            loading={series === null}
          />
        ))}
      </div>
    </Card>
  );
}
```

- [ ] **Step 5: Run** — `npx vitest run app/components/RoomMetricCard.test.tsx` → PASS. Then `npx eslint app/components/RoomMetricCard.tsx` + `npx tsc --noEmit -p tsconfig.json` → clean, and `npm run build` → succeeds (recharts bundles).

- [ ] **Step 6: Commit** — include `package.json` + the lockfile.

---

### Task 9: `metricCardSpan` helper + move metric cards into their own grid

**Files:**
- Modify: `lib/metrics.ts` (add `metricCardSpan`)
- Modify: `app/page.tsx`
- Test: `lib/metrics.test.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: `metricCardSpan(visibleCount: number): "col-span-1" | "col-span-2"`.

- [ ] **Step 1: Failing test** — append to `lib/metrics.test.ts`:

```ts
import { metricCardSpan } from "@/lib/metrics";

describe("metricCardSpan", () => {
  it("is full-width with 2+ visible metrics, half-width with 1", () => {
    expect(metricCardSpan(2)).toBe("col-span-2");
    expect(metricCardSpan(1)).toBe("col-span-1");
    expect(metricCardSpan(3)).toBe("col-span-2");
  });
});
```

- [ ] **Step 2: Run, expect FAIL.**

- [ ] **Step 3: Implement in `lib/metrics.ts`** (append):

```ts
/** Home-grid column span for a metric card: full when 2+ metrics, half when 1. */
export function metricCardSpan(visibleCount: number): "col-span-1" | "col-span-2" {
  return visibleCount >= 2 ? "col-span-2" : "col-span-1";
}
```

- [ ] **Step 4: Run** → PASS.

- [ ] **Step 5: Edit `app/page.tsx`.**

(a) Add the import:

```ts
import { RoomMetricCard } from "@/app/components/RoomMetricCard";
import { metricCardSpan } from "@/lib/metrics";
```

(b) After `const t = useT();`, compute the metric rooms (safe when `state` is null):

```ts
  const metricRooms = state ? state.metrics.filter((room) => room.metrics.some((m) => m.visible)) : [];
```

(c) REMOVE the metric-cards block currently inside the masonry `<div className="columns-1 …">` (the
`{state.metrics.filter(...).map(...)}` block) so the masonry holds only lights/thermostat/chills.

(d) After the masonry `</div>` (still inside the `: (` branch, as a sibling of the masonry div), add the metric grid:

```tsx
          {metricRooms.length > 0 && (
            <div className="grid grid-cols-2 gap-4 grid-flow-row-dense md:grid-cols-4 items-start">
              {metricRooms.map((room, i) => (
                <div
                  key={room.key}
                  className={`animate-rise ${metricCardSpan(room.metrics.filter((m) => m.visible).length)}`}
                  style={{ animationDelay: `${180 + (state.chills.length + i) * 60}ms` }}
                >
                  <RoomMetricCard room={room} />
                </div>
              ))}
            </div>
          )}
```

Because the masonry `<div>` and this grid `<div>` are now two children of the `: (` branch, wrap them in a fragment `<>…</>` if they aren't already under a single parent. (The `{!state ? … : ( … )}` branch must return one element — use `<>…</>` around the masonry div + the metric grid.)

- [ ] **Step 6: Verify** — `npx eslint app/page.tsx lib/metrics.ts` + `npx tsc --noEmit -p tsconfig.json` → clean; `npm run build` → succeeds; `npm test` → green.

- [ ] **Step 7: Commit.**

---

### Task 10: Final verification

**Files:** none.

- [ ] **Step 1: Full suite** — `npm test` → all pass (209 existing + new).
- [ ] **Step 2: Lint** — `npx eslint lib/metrics.ts lib/metrics-history.ts lib/metrics-history-store.ts lib/metrics-sampler.ts lib/state-mapper.ts instrumentation.ts app/api/history/route.ts app/components/RoomMetricCard.tsx app/page.tsx lib/i18n.ts` → clean.
- [ ] **Step 3: Build** — `npm run build` → succeeds.
- [ ] **Step 4: Manual smoke (optional, needs HA)** — `npm run dev`; the home grid shows metric cards as two-panel charts (temp left, humidity right); single-metric rooms (Zolder/Speelkamer/Buiten) are half-width and pair up; range buttons switch 24h/7d/30d; fresh deploy shows "Gegevens verzamelen…" until ≥2 samples accumulate (the immediate sample + the next 30-min tick).

---

## Self-Review

**Spec coverage:**
- 30-min sampler + immediate sample, HA-down skip → Task 5. ✓
- Rolling 30-day history, atomic write, prune → Tasks 2 + 3. ✓
- Pure logic separated (history + sampler) → Tasks 2 + 4. ✓
- Shared `numericState` (DRY with mapMetrics) → Task 1. ✓
- `GET /api/history` windowed/downsampled, 24h raw / 7d-30d ≤150, 400 on bad input → Task 6. ✓
- Card = two side-by-side panels (temp left, humidity right), recharts, per-card range toggle default 24h, current value labels, collecting state → Task 8. ✓
- Half-width single-metric cards via own grid + `metricCardSpan` → Task 9. ✓
- recharts dependency → Task 8. ✓
- i18n range + collecting keys → Task 7. ✓
- Edge cases: null gaps (`connectNulls={false}`, null in samples), corrupt/missing file → empty, removed/added sensor → Tasks 2/3/4/6. ✓
- Tests for each pure module + route + card → Tasks 1–9. ✓

**Placeholder scan:** none — every step has concrete code/commands.

**Type consistency:** `MetricSample`/`MetricHistory` defined in Task 2, used by Tasks 3/4/6. `Series`/`Point` shape produced by Task 6's route matches what Task 8's card consumes (`{ kind, unit, points: {t,value}[] }`). `numericState`/`METRIC_UNIT_FALLBACK` defined Task 1, used Tasks 4/6 and the refactor. `RANGE_MS` keys (`24h|7d|30d`) consistent across Tasks 2/6/8. `metricCardSpan` defined Task 9, used in `page.tsx` Task 9.
