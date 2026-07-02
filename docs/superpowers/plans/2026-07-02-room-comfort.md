# Room Comfort (Mollier variant A) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show derived psychrometric chips (dew point, absolute humidity, comfort/condensation status) under the room name on each metric card, for rooms reporting both temperature and humidity.

**Architecture:** A pure `lib/psychrometrics.ts` (Magnus) computes dew point / absolute humidity / a comfort status; `mapMetrics` attaches a nullable `comfort` to `RoomMetrics`; `RoomMetricCard` renders a small chip row from it. Additive, `main`-based.

**Tech Stack:** TypeScript, Next.js, React, recharts (already used by the card), Vitest + @testing-library/react.

## Global Constraints

- Magnus formulas, p = 1013 hPa. `saturationVaporPressure(T) = 6.112*exp((17.62*T)/(243.12+T))`; `absoluteHumidity(T,RH) g/kg = 621.97*e/(1013-e)` with `e=(RH/100)*es(T)`; `dewPoint(T,RH) = 243.12*a/(17.62-a)`, `a = ln(RH/100)+(17.62*T)/(243.12+T)`.
- Reference (locked): `20, 50` → absHumidity ≈ 7.24, dewPoint ≈ 9.26.
- `roomComfort` status: `condensation` if `(T-dewPoint) < 3`; else `humid` if `RH > 65`; else `dry` if `RH < 35`; else `comfortable`.
- `comfort` is `null` when temperature or humidity is missing/non-numeric. Rooms with null comfort render no chips.
- Chip colours: comfortable `#22b39e`, humid/dry `var(--accent-warn)`, condensation `#e85f4c`.
- i18n keys in BOTH en + nl. Additive; existing chart panels unchanged. Test: `npm test`; build `npm run build` (exit 0).

## File Structure

- `lib/psychrometrics.ts` (create) — pure helpers + `roomComfort`.
- `lib/types.ts` (modify) — `ComfortStatus`, `RoomComfort`, `RoomMetrics.comfort`.
- `lib/state-mapper.ts` (modify) — `mapMetrics` computes `comfort`.
- `app/components/RoomMetricCard.tsx` (modify) — chip row.
- `lib/i18n.ts` (modify) — `comfort.*` keys (en + nl).
- Tests: `lib/psychrometrics.test.ts` (create); `lib/state-mapper.test.ts` (extend); `app/components/RoomMetricCard.test.tsx` (extend).

---

### Task 1: Psychrometrics lib + types + mapMetrics

**Files:**
- Create: `lib/psychrometrics.ts`, `lib/psychrometrics.test.ts`
- Modify: `lib/types.ts`, `lib/state-mapper.ts`
- Test: `lib/state-mapper.test.ts` (extend)

**Interfaces:**
- Produces: `saturationVaporPressure(T:number):number`, `absoluteHumidity(T:number,RH:number):number`, `dewPoint(T:number,RH:number):number`, `roomComfort(T:number,RH:number):RoomComfort`; `ComfortStatus`, `RoomComfort`; `RoomMetrics.comfort: RoomComfort | null`.

- [ ] **Step 1: Write the failing tests**

Create `lib/psychrometrics.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { absoluteHumidity, dewPoint, roomComfort } from "@/lib/psychrometrics";

describe("psychrometrics", () => {
  it("matches the reference point 20C/50%", () => {
    expect(absoluteHumidity(20, 50)).toBeCloseTo(7.24, 1);
    expect(dewPoint(20, 50)).toBeCloseTo(9.26, 1);
  });
  it("classifies comfort status", () => {
    expect(roomComfort(22.5, 82).status).toBe("condensation"); // T-Td < 3
    expect(roomComfort(21, 70).status).toBe("humid");
    expect(roomComfort(21, 30).status).toBe("dry");
    expect(roomComfort(21.5, 52).status).toBe("comfortable");
  });
  it("returns the derived numbers on the comfort object", () => {
    const c = roomComfort(20, 50);
    expect(c.dewPoint).toBeCloseTo(9.26, 1);
    expect(c.absHumidity).toBeCloseTo(7.24, 1);
  });
});
```

Add to `lib/state-mapper.test.ts`:

```ts
it("attaches comfort to a metric room with both temperature and humidity", () => {
  const states = [
    { entity_id: "sensor.woonkamer_woonkamer_temperature", state: "21.5", attributes: { unit_of_measurement: "°C" } },
    { entity_id: "sensor.woonkamer_woonkamer_humidity", state: "52", attributes: { unit_of_measurement: "%" } },
  ] as any;
  const app = mapHaStatesToAppState(states);
  const wk = app.metrics.find((r) => r.key === "woonkamer");
  expect(wk?.comfort?.status).toBe("comfortable");
  expect(wk?.comfort?.dewPoint).toBeCloseTo(11.2, 0);
});

it("comfort is null when a metric room is missing humidity", () => {
  const states = [
    { entity_id: "sensor.woonkamer_woonkamer_temperature", state: "21.5", attributes: { unit_of_measurement: "°C" } },
  ] as any;
  const app = mapHaStatesToAppState(states);
  expect(app.metrics.find((r) => r.key === "woonkamer")?.comfort).toBeNull();
});
```

(Match the existing `mapHaStatesToAppState(...)` call style in that file. `app.metrics` is the `RoomMetrics[]` field on AppState — confirm the field name in the file and use it.)

- [ ] **Step 2: Run to verify failure**

Run: `npm test -- "psychrometrics|state-mapper"`
Expected: FAIL — `lib/psychrometrics.ts` missing; `comfort` undefined.

- [ ] **Step 3: Implement**

Create `lib/psychrometrics.ts`:

```ts
import type { RoomComfort } from "@/lib/types";

const P_HPA = 1013;

/** Saturation vapour pressure (Magnus, hPa). */
export function saturationVaporPressure(T: number): number {
  return 6.112 * Math.exp((17.62 * T) / (243.12 + T));
}

/** Absolute humidity / mixing ratio (g water per kg dry air). */
export function absoluteHumidity(T: number, RH: number): number {
  const e = (RH / 100) * saturationVaporPressure(T);
  return (621.97 * e) / (P_HPA - e);
}

/** Dew point temperature (°C). */
export function dewPoint(T: number, RH: number): number {
  const a = Math.log(RH / 100) + (17.62 * T) / (243.12 + T);
  return (243.12 * a) / (17.62 - a);
}

/** Derived comfort/condensation summary for a room from its temp (°C) + RH (%). */
export function roomComfort(T: number, RH: number): RoomComfort {
  const td = dewPoint(T, RH);
  const status =
    T - td < 3 ? "condensation"
    : RH > 65 ? "humid"
    : RH < 35 ? "dry"
    : "comfortable";
  return { dewPoint: td, absHumidity: absoluteHumidity(T, RH), status };
}
```

In `lib/types.ts`, add (near `RoomMetrics` / `MetricValue`):

```ts
export type ComfortStatus = "comfortable" | "humid" | "dry" | "condensation";
export interface RoomComfort {
  dewPoint: number;    // °C
  absHumidity: number; // g/kg
  status: ComfortStatus;
}
```

and add to the `RoomMetrics` interface:

```ts
  /** Derived psychrometric summary (dew point / abs humidity / status), or null if temp+humidity unavailable. */
  comfort: RoomComfort | null;
```

In `lib/state-mapper.ts`: add `import { roomComfort } from "@/lib/psychrometrics";`. In `mapMetrics`, after building `metrics` and before the `return`, compute comfort:

```ts
    const temp = metrics.find((m) => m.kind === "temperature")?.value;
    const humidity = metrics.find((m) => m.kind === "humidity")?.value;
    const comfort =
      typeof temp === "number" && typeof humidity === "number"
        ? roomComfort(temp, humidity)
        : null;
```

and add `comfort,` to the returned object literal `{ key: room.key, name: room.name, metrics, comfort }`.

- [ ] **Step 4: Run to verify pass**

Run: `npm test -- "psychrometrics|state-mapper"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/psychrometrics.ts lib/psychrometrics.test.ts lib/types.ts lib/state-mapper.ts lib/state-mapper.test.ts
git commit -m "feat(comfort): psychrometric helpers + comfort on RoomMetrics"
```

---

### Task 2: Comfort chips on RoomMetricCard + i18n

**Files:**
- Modify: `app/components/RoomMetricCard.tsx`, `lib/i18n.ts`
- Test: `app/components/RoomMetricCard.test.tsx` (extend)

**Interfaces:**
- Consumes: `RoomMetrics.comfort` (Task 1); `ComfortStatus`.

- [ ] **Step 1: i18n keys**

In `lib/i18n.ts` `en`:

```ts
  "comfort.dewPoint": "Dew point",
  "comfort.absHumidity": "Abs. humidity",
  "comfort.comfortable": "Comfortable",
  "comfort.humid": "Humid",
  "comfort.dry": "Dry",
  "comfort.condensation": "Condensation risk",
```

In `nl`:

```ts
  "comfort.dewPoint": "Dauwpunt",
  "comfort.absHumidity": "Abs. vocht",
  "comfort.comfortable": "Comfortabel",
  "comfort.humid": "Te vochtig",
  "comfort.dry": "Te droog",
  "comfort.condensation": "Condensatierisico",
```

- [ ] **Step 2: Write the failing test**

Add to `app/components/RoomMetricCard.test.tsx` (it already renders the card wrapped in `LanguageProvider` — match its existing pattern and `RoomMetrics` fixture; add `comfort` to the fixture):

```tsx
it("shows comfort chips with the status label when comfort is present", () => {
  const room = { key: "woonkamer", name: "Woonkamer", metrics: [], comfort: { dewPoint: 11.2, absHumidity: 8.3, status: "condensation" } } as any;
  render(<LanguageProvider initial="en"><RoomMetricCard room={room} /></LanguageProvider>);
  expect(screen.getByText(/Condensation risk/i)).toBeTruthy();
  expect(screen.getByText(/8\.3 g\/kg/)).toBeTruthy();
  expect(screen.getByText(/11°/)).toBeTruthy();
});

it("shows no comfort chips when comfort is null", () => {
  const room = { key: "zolder", name: "Zolder", metrics: [], comfort: null } as any;
  render(<LanguageProvider initial="en"><RoomMetricCard room={room} /></LanguageProvider>);
  expect(screen.queryByText(/g\/kg/)).toBeNull();
});
```

(If the existing test file uses a helper to build the room / a render wrapper, use it and just set `comfort`.)

- [ ] **Step 3: Run to verify failure**

Run: `npm test -- RoomMetricCard`
Expected: FAIL — no chips yet.

- [ ] **Step 4: Implement**

In `app/components/RoomMetricCard.tsx`:

Add `import type { ComfortStatus } from "@/lib/types";` if needed (the `room` prop is already typed `RoomMetrics`, which now carries `comfort`). Ensure `useT`/`t` is available (the card already calls `t(...)`).

Add a status→colour map near the top of the file:

```ts
const COMFORT_COLOR: Record<ComfortStatus, string> = {
  comfortable: "#22b39e",
  humid: "var(--accent-warn)",
  dry: "var(--accent-warn)",
  condensation: "#e85f4c",
};
```

Directly under the room-name `<h2>` (the `{room.name}` header), add the chip row:

```tsx
{room.comfort && (
  <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-[var(--muted)]">
    <span>{t("comfort.dewPoint")} {Math.round(room.comfort.dewPoint)}°</span>
    <span aria-hidden>·</span>
    <span>{room.comfort.absHumidity.toFixed(1)} g/kg</span>
    <span
      className="rounded-full px-2 py-0.5 font-medium"
      style={{ color: COMFORT_COLOR[room.comfort.status], backgroundColor: `color-mix(in srgb, ${COMFORT_COLOR[room.comfort.status]} 15%, transparent)` }}
    >
      {t(`comfort.${room.comfort.status}` as const)}
    </span>
  </div>
)}
```

(If the `t(`comfort.${status}`)` template type doesn't satisfy `MsgKey`, map explicitly: `const STATUS_KEY: Record<ComfortStatus, MsgKey> = { comfortable: "comfort.comfortable", humid: "comfort.humid", dry: "comfort.dry", condensation: "comfort.condensation" };` and use `t(STATUS_KEY[room.comfort.status])`.)

- [ ] **Step 5: Run tests + build**

Run: `npm test -- RoomMetricCard` → PASS.
Run: `npm test` → full suite green.
Run: `npm run build` → exit 0.

- [ ] **Step 6: Commit**

```bash
git add app/components/RoomMetricCard.tsx lib/i18n.ts app/components/RoomMetricCard.test.tsx
git commit -m "feat(comfort): dew point / abs humidity / status chips on the metric card"
```

## Notes for the implementer

- `nl` is a `Record<MsgKey, string>` — every new key must exist in both `en` and `nl` or the build fails. Good.
- The chip row goes UNDER the room-name heading, ABOVE the chart panels; keep it compact (text-xs) and don't disturb the existing range toggle / chart layout.
- Prefer the explicit `STATUS_KEY` map if the template-literal key trips the `MsgKey` type.
- `color-mix` is supported in the app's target browsers (already used elsewhere for tints); if lint/build complains, fall back to a fixed low-opacity background per status.
