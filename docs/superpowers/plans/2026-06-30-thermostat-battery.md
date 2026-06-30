# Thermostat Battery + Valve Warning Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Battery icon on the Thermostat card (Tado RU02 wall unit, binary ok/low → red) plus a "radiator valve battery low" warning that appears only when one or more Tado valves report low.

**Architecture:** Hardcoded binary-sensor ids → `ThermostatState.batteryLow` (RU02) + `valvesLow` (count of low VA02 valves), set in `mapThermostat`; `ThermostatCard` renders an icon + a conditional count warning. Extends the room-battery feature on `feat/battery-indicator`.

**Tech Stack:** TypeScript, Next.js, React, lucide-react, Vitest + @testing-library/react.

## Global Constraints

- Binary battery (HA `device_class: battery`): `state === "on"` = LOW, `"off"` = ok, missing/`unavailable`/`unknown` = unknown.
- `batteryLow: boolean | null` (true=low, false=ok, null=unknown/missing). `valvesLow: number` = count of valve sensors with state `"on"` (0 when none/unknown).
- Icon ONLY for the battery state (no %); muted (`text-[var(--muted)]`) when ok, red (`text-[#e85f4c]`) when low; no icon when null. Valve warning shown only when `valvesLow > 0`.
- i18n keys in BOTH en + nl. Additive; no other ThermostatCard behavior changed.
- Test: `npm test`; build `npm run build` (exit 0).

## File Structure

- `config/devices.ts` (modify) — `THERMOSTAT_BATTERY`, `VALVE_BATTERIES`.
- `lib/types.ts` (modify) — `ThermostatState.batteryLow`, `.valvesLow`.
- `lib/state-mapper.ts` (modify) — `mapThermostat` sets both.
- `app/components/ThermostatCard.tsx` (modify) — icon + valve warning.
- `lib/i18n.ts` (modify) — `thermostat.*` battery keys (en + nl).
- Tests: `lib/state-mapper.test.ts` (extend); `app/components/ThermostatCard.test.tsx` (extend or create).

---

### Task 1: Data + `mapThermostat`

**Files:**
- Modify: `config/devices.ts`, `lib/types.ts`, `lib/state-mapper.ts`
- Test: `lib/state-mapper.test.ts` (extend)

**Interfaces:**
- Produces: `THERMOSTAT_BATTERY: string`; `VALVE_BATTERIES: string[]`; `ThermostatState.batteryLow: boolean | null`; `ThermostatState.valvesLow: number`.

- [ ] **Step 1: Write the failing test**

Add to `lib/state-mapper.test.ts`:

```ts
it("maps thermostat battery (RU02 binary) and counts low valves", () => {
  const states = [
    { entity_id: "climate.woonkamer_woonkamer", state: "heat", attributes: { current_temperature: 20, temperature: 21, hvac_action: "heating", min_temp: 5, max_temp: 25 } },
    { entity_id: "binary_sensor.ru2161981184_battery", state: "off", attributes: { device_class: "battery" } },
    { entity_id: "binary_sensor.va0622409216_battery", state: "on", attributes: { device_class: "battery" } },
    { entity_id: "binary_sensor.va1093176832_battery", state: "off", attributes: { device_class: "battery" } },
  ] as any;
  const app = mapHaStatesToAppState(states);
  expect(app.thermostat.batteryLow).toBe(false); // RU02 off = ok
  expect(app.thermostat.valvesLow).toBe(1);       // one VA on
});

it("thermostat batteryLow is null when the RU02 sensor is missing", () => {
  const app = mapHaStatesToAppState([{ entity_id: "climate.woonkamer_woonkamer", state: "off", attributes: {} }] as any);
  expect(app.thermostat.batteryLow).toBeNull();
  expect(app.thermostat.valvesLow).toBe(0);
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npm test -- state-mapper`
Expected: FAIL — `batteryLow`/`valvesLow` undefined.

- [ ] **Step 3: Implement**

In `config/devices.ts` (near the room battery / climate config):

```ts
/** Tado wall thermostat (RU02) low-battery binary sensor (on = low). */
export const THERMOSTAT_BATTERY = "binary_sensor.ru2161981184_battery";
/** Tado smart radiator valves (VA02) low-battery binary sensors (on = low). */
export const VALVE_BATTERIES: readonly string[] = [
  "binary_sensor.va0622409216_battery",
  "binary_sensor.va1093176832_battery",
  "binary_sensor.va1244302848_battery",
  "binary_sensor.va1529253376_battery",
  "binary_sensor.va4012412416_battery",
  "binary_sensor.va4149819136_battery",
];
```

In `lib/types.ts` `ThermostatState`, add after `status`:

```ts
  /** Tado wall-unit battery: true=low, false=ok, null=no sensor. */
  batteryLow: boolean | null;
  /** Number of Tado radiator valves reporting low battery. */
  valvesLow: number;
```

In `lib/state-mapper.ts`: add `THERMOSTAT_BATTERY, VALVE_BATTERIES` to the `@/config/devices` import. In `mapThermostat`, before the `return`, compute:

```ts
  const ruState = byId.get(THERMOSTAT_BATTERY)?.state;
  const batteryLow = ruState === "on" ? true : ruState === "off" ? false : null;
  const valvesLow = VALVE_BATTERIES.filter((id) => byId.get(id)?.state === "on").length;
```

and add `batteryLow,` and `valvesLow,` to the returned object.

- [ ] **Step 4: Run to verify pass**

Run: `npm test -- state-mapper`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add config/devices.ts lib/types.ts lib/state-mapper.ts lib/state-mapper.test.ts
git commit -m "feat(battery): thermostat (RU02) battery + low-valve count in mapThermostat"
```

---

### Task 2: ThermostatCard icon + valve warning + i18n

**Files:**
- Modify: `app/components/ThermostatCard.tsx`, `lib/i18n.ts`
- Test: `app/components/ThermostatCard.test.tsx` (extend or create)

**Interfaces:**
- Consumes: `ThermostatState.batteryLow`, `.valvesLow`.

- [ ] **Step 1: i18n keys**

In `lib/i18n.ts` `en`:

```ts
  "thermostat.batteryOk": "Battery OK",
  "thermostat.batteryLow": "Battery low",
  "thermostat.valveLowOne": "Radiator valve battery low",
  "thermostat.valveLowMany": "{count} radiator valves battery low",
```

In `nl`:

```ts
  "thermostat.batteryOk": "Batterij ok",
  "thermostat.batteryLow": "Batterij bijna leeg",
  "thermostat.valveLowOne": "Radiatorknop batterij bijna leeg",
  "thermostat.valveLowMany": "{count} radiatorknoppen batterij bijna leeg",
```

- [ ] **Step 2: Write the failing test**

Add to (or create) `app/components/ThermostatCard.test.tsx`. Follow the project's component-test pattern (wrap in `LanguageProvider`; build a `ThermostatState` fixture). Cases:

```tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ThermostatCard } from "@/app/components/ThermostatCard";
import { LanguageProvider } from "@/app/components/LanguageProvider";

function thermo(over = {}) {
  return { id: "climate.x", name: "Thermostat", available: true, current: 20, setpoint: 21, min: 5, max: 25, step: 0.5, status: "heating", batteryLow: false, valvesLow: 0, ...over } as any;
}
function wrap(ui: any) { return <LanguageProvider initial="en">{ui}</LanguageProvider>; }

describe("ThermostatCard battery", () => {
  it("shows an ok battery icon when batteryLow is false", () => {
    render(wrap(<ThermostatCard thermostat={thermo()} onAction={() => {}} />));
    expect(screen.getByLabelText("Battery OK")).toBeTruthy();
  });
  it("shows a red low battery icon when batteryLow is true", () => {
    render(wrap(<ThermostatCard thermostat={thermo({ batteryLow: true })} onAction={() => {}} />));
    expect(screen.getByLabelText("Battery low")).toHaveClass("text-[#e85f4c]");
  });
  it("shows no battery icon when batteryLow is null", () => {
    render(wrap(<ThermostatCard thermostat={thermo({ batteryLow: null })} onAction={() => {}} />));
    expect(screen.queryByLabelText(/Battery/)).toBeNull();
  });
  it("shows the singular valve warning when one valve is low", () => {
    render(wrap(<ThermostatCard thermostat={thermo({ valvesLow: 1 })} onAction={() => {}} />));
    expect(screen.getByText("Radiator valve battery low")).toBeTruthy();
  });
  it("shows the plural valve warning with the count", () => {
    render(wrap(<ThermostatCard thermostat={thermo({ valvesLow: 3 })} onAction={() => {}} />));
    expect(screen.getByText("3 radiator valves battery low")).toBeTruthy();
  });
  it("shows no valve warning when none are low", () => {
    render(wrap(<ThermostatCard thermostat={thermo({ valvesLow: 0 })} onAction={() => {}} />));
    expect(screen.queryByText(/valve/i)).toBeNull();
  });
});
```

- [ ] **Step 3: Run to verify failure**

Run: `npm test -- ThermostatCard`
Expected: FAIL — no battery icon / valve warning yet.

- [ ] **Step 4: Implement**

In `app/components/ThermostatCard.tsx`:

Add to the `lucide-react` import: `BatteryFull, BatteryWarning, AlertTriangle`. `useT` (`t`) is already available in the component (it uses `MsgKey`/status keys); if not, import `useT` and call `const t = useT();`.

Next to the thermostat **name/title** in the header, render the battery icon when `thermostat.batteryLow != null`:

```tsx
{thermostat.batteryLow != null && (
  thermostat.batteryLow
    ? <BatteryWarning size={15} aria-label={t("thermostat.batteryLow")} className="text-[#e85f4c]" />
    : <BatteryFull size={15} aria-label={t("thermostat.batteryOk")} className="text-[var(--muted)]" />
)}
```

And a small valve warning line (place it under the title / near the status), shown only when `thermostat.valvesLow > 0`:

```tsx
{thermostat.valvesLow > 0 && (
  <div className="mt-1 flex items-center gap-1 text-xs text-[var(--accent-warn)]">
    <AlertTriangle size={12} aria-hidden />
    {thermostat.valvesLow === 1
      ? t("thermostat.valveLowOne")
      : t("thermostat.valveLowMany", { count: thermostat.valvesLow })}
  </div>
)}
```

(`t(key, { count })` — the project's `t()` supports `{param}` interpolation, as used elsewhere e.g. `lights.switchRoom`.)

- [ ] **Step 5: Run tests + build**

Run: `npm test -- ThermostatCard` → PASS.
Run: `npm test` → full suite green.
Run: `npm run build` → exit 0.

- [ ] **Step 6: Commit**

```bash
git add app/components/ThermostatCard.tsx lib/i18n.ts app/components/ThermostatCard.test.tsx
git commit -m "feat(battery): thermostat battery icon + radiator-valve low warning"
```

## Notes for the implementer

- HA battery `binary_sensor` convention: `on` = low/problem. The mapper already encodes that (`state === "on"` → low). Do not invert.
- Place the battery icon inline with the thermostat name (small, unobtrusive), matching the room-card icon style (size 15, muted/red).
- `t()` interpolation: confirm the existing call style (e.g. `t("lights.switchRoom", { room })`) and mirror it for `{ count }`.
- If `ThermostatCard.test.tsx` doesn't exist, create it with the cases above; if it does, add the battery `describe` block.
