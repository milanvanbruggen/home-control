# Battery Indicator (room cards) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show a small battery icon on a room card when that room has a configured battery sensor (the 3 Hue dial switches), reflecting level by icon shape, red when low.

**Architecture:** A hardcoded `ROOM_BATTERY` map (room key → battery sensor) feeds an optional `RoomState.batteryPct`; a pure `batteryLevel()` helper maps a % to an icon level; `LightScenes` renders the matching lucide battery icon in the room-card header.

**Tech Stack:** TypeScript, Next.js, React, lucide-react, Vitest + @testing-library/react.

## Global Constraints

- Targeted at `main` (no device config) — the mapping is a hardcoded `ROOM_BATTERY` in `config/devices.ts`. Owner-specific by design.
- Icon ONLY (no number on screen); the % appears in the icon's `title`/`aria-label`.
- Thresholds: `>=60 full`, `>=30 medium`, `>=10 low`, `<10 warning`; `low` (red) when `pct < 20`.
- Rooms without a battery sensor render no icon (no clutter). `batteryPct` is `null` for them and for missing/unavailable sensors.
- Additive: no behavior change to existing cards. Test: `npm test`; build `npm run build` (exit 0).

## File Structure

- `config/devices.ts` (modify) — `ROOM_BATTERY` map.
- `lib/types.ts` (modify) — `RoomState.batteryPct`.
- `lib/state-mapper.ts` (modify) — `mapRoom` sets `batteryPct`.
- `lib/battery.ts` (create) — `batteryLevel()` pure helper.
- `app/components/LightScenes.tsx` (modify) — render the battery icon.
- Tests: `lib/battery.test.ts` (create); `lib/state-mapper.test.ts` (extend); `app/components/LightScenes.test.tsx` (extend or create).

---

### Task 1: Data + `batteryLevel` helper

**Files:**
- Modify: `config/devices.ts`, `lib/types.ts`, `lib/state-mapper.ts`
- Create: `lib/battery.ts`, `lib/battery.test.ts`
- Test: `lib/state-mapper.test.ts` (extend)

**Interfaces:**
- Produces: `ROOM_BATTERY: Record<string,string>`; `RoomState.batteryPct: number | null`; `batteryLevel(pct: number): { level: "full"|"medium"|"low"|"warning"; low: boolean }`.

- [ ] **Step 1: Write the failing tests**

Create `lib/battery.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { batteryLevel } from "@/lib/battery";

describe("batteryLevel", () => {
  it("maps % to an icon level", () => {
    expect(batteryLevel(100).level).toBe("full");
    expect(batteryLevel(60).level).toBe("full");
    expect(batteryLevel(59).level).toBe("medium");
    expect(batteryLevel(30).level).toBe("medium");
    expect(batteryLevel(29).level).toBe("low");
    expect(batteryLevel(10).level).toBe("low");
    expect(batteryLevel(9).level).toBe("warning");
    expect(batteryLevel(0).level).toBe("warning");
  });
  it("flags low (red) under 20%", () => {
    expect(batteryLevel(20).low).toBe(false);
    expect(batteryLevel(19).low).toBe(true);
    expect(batteryLevel(5).low).toBe(true);
  });
});
```

Add to `lib/state-mapper.test.ts` (it already imports/builds HA-state fixtures and calls `mapHaStatesToAppState`):

```ts
it("sets room batteryPct from the mapped dial-switch sensor, null when absent", () => {
  const states = [
    { entity_id: "light.woonkamer", state: "on", attributes: { brightness: 128 } },
    { entity_id: "sensor.dial_switch_woonkamer_battery", state: "82", attributes: { unit_of_measurement: "%" } },
    { entity_id: "light.werkkamer", state: "off", attributes: {} }, // no battery mapping
  ] as any;
  const app = mapHaStatesToAppState(states);
  expect(app.rooms.find((r) => r.key === "woonkamer")?.batteryPct).toBe(82);
  expect(app.rooms.find((r) => r.key === "werkkamer")?.batteryPct).toBeNull();
});
```

(Note: `mapHaStatesToAppState(states)` is the main signature — states only. If the local test file calls it with more args, match that file's existing call style.)

- [ ] **Step 2: Run to verify failure**

Run: `npm test -- "battery|state-mapper"`
Expected: FAIL — `lib/battery.ts` missing; `batteryPct` undefined on RoomState.

- [ ] **Step 3: Implement**

Create `lib/battery.ts`:

```ts
export type BatteryLevel = "full" | "medium" | "low" | "warning";

/** Map a battery percentage to an icon level + a `low` flag (drives red emphasis). */
export function batteryLevel(pct: number): { level: BatteryLevel; low: boolean } {
  const level: BatteryLevel = pct >= 60 ? "full" : pct >= 30 ? "medium" : pct >= 10 ? "low" : "warning";
  return { level, low: pct < 20 };
}
```

In `lib/types.ts`, add to `RoomState` (after `activeScene`):

```ts
  /** Battery % of the room's controller (e.g. Hue dial switch), or null if none. */
  batteryPct: number | null;
```

In `config/devices.ts`, add the mapping (near the room definitions):

```ts
/** Room key → battery sensor entity (for the small battery icon on the room card). */
export const ROOM_BATTERY: Record<string, string> = {
  woonkamer: "sensor.dial_switch_woonkamer_battery",
  keuken: "sensor.dial_switch_keuken_battery",
  slaapkamer: "sensor.dial_switch_slaapkamer_battery",
};
```

In `lib/state-mapper.ts`: import `ROOM_BATTERY` from `@/config/devices` (add to the existing devices import), and in `mapRoom`, before the `return`, compute the battery and add it to the returned object:

```ts
  const batSensor = ROOM_BATTERY[room.key];
  const batRaw = batSensor ? numericState(byId.get(batSensor)) : null;
  const batteryPct = batRaw == null ? null : Math.max(0, Math.min(100, Math.round(batRaw)));
```

and add `batteryPct,` to the returned `RoomState` object literal.

- [ ] **Step 4: Run to verify pass**

Run: `npm test -- "battery|state-mapper"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/battery.ts lib/battery.test.ts lib/types.ts config/devices.ts lib/state-mapper.ts
git commit -m "feat(battery): room batteryPct from dial-switch sensor + level helper"
```

---

### Task 2: Battery icon on the room card

**Files:**
- Modify: `app/components/LightScenes.tsx`
- Test: `app/components/LightScenes.test.tsx` (extend or create)

**Interfaces:**
- Consumes: `RoomState.batteryPct` (Task 1); `batteryLevel` (`@/lib/battery`).

- [ ] **Step 1: Write the failing test**

Add to (or create) `app/components/LightScenes.test.tsx` a test that the icon shows with the % in its accessible label for a room with a battery, and is absent otherwise. Follow the project's component-test pattern (render with `LanguageProvider`, query by role/label):

```tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { LightScenes } from "@/app/components/LightScenes";
import { LanguageProvider } from "@/app/components/LanguageProvider";

function room(over = {}) {
  return { key: "woonkamer", name: "Woonkamer", lightId: "light.woonkamer", on: true, brightness: 40, scenes: [], favorites: [], activeScene: null, batteryPct: 82, ...over } as any;
}
function wrap(ui: any) { return <LanguageProvider initial="en">{ui}</LanguageProvider>; }

describe("LightScenes battery icon", () => {
  it("shows a battery icon with the % in its label when batteryPct is set", () => {
    render(wrap(<LightScenes rooms={[room()]} onScene={() => {}} />));
    expect(screen.getByLabelText("Battery 82%")).toBeTruthy();
  });
  it("shows no battery icon when batteryPct is null", () => {
    render(wrap(<LightScenes rooms={[room({ batteryPct: null })]} onScene={() => {}} />));
    expect(screen.queryByLabelText(/Battery/)).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npm test -- LightScenes`
Expected: FAIL — no battery icon yet.

- [ ] **Step 3: Implement**

In `app/components/LightScenes.tsx`:

Add the icon imports to the existing `lucide-react` import:

```ts
import { BatteryFull, BatteryMedium, BatteryLow, BatteryWarning } from "lucide-react";
```

Add `import { batteryLevel } from "@/lib/battery";` near the other lib imports.

In the card header where the room name / switcher renders, add the battery icon for `current.batteryPct`:

```tsx
{current?.batteryPct != null && (() => {
  const { level, low } = batteryLevel(current.batteryPct);
  const Icon = level === "full" ? BatteryFull : level === "medium" ? BatteryMedium : level === "low" ? BatteryLow : BatteryWarning;
  return (
    <Icon
      size={15}
      aria-label={`Battery ${current.batteryPct}%`}
      className={low ? "text-[#e85f4c]" : "text-[var(--muted)]"}
    />
  );
})()}
```

Place this inline next to the room name/title element in the header (so it sits beside the room name). Keep it small and unobtrusive.

- [ ] **Step 4: Run tests + build**

Run: `npm test -- LightScenes` → PASS.
Run: `npm test` → full suite green.
Run: `npm run build` → exit 0.

- [ ] **Step 5: Commit**

```bash
git add app/components/LightScenes.tsx app/components/LightScenes.test.tsx
git commit -m "feat(battery): small battery icon on the room card"
```

## Notes for the implementer

- `numericState` (already imported in `state-mapper.ts`) returns `null` for missing/unavailable/non-numeric states, so a missing dial-switch sensor → `batteryPct: null` → no icon. Good.
- The icon's `aria-label`/`title` is the ONLY place the number appears — on-screen it's icon-only, per the design.
- If `app/components/LightScenes.test.tsx` doesn't exist yet, create it with the test above plus the standard provider wrapper; if it exists, add the two cases.
- Find the exact header element rendering `current.name` (the room title / switcher) and place the icon adjacent to it.
