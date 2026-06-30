# Thermostat battery + radiator-valve low-battery warning

**Date:** 2026-06-30
**Status:** Approved design. Extends the battery feature on branch `feat/battery-indicator` (off `main`).

## Context

The room cards already show a battery icon (Hue dial switches, %). The Tado climate
system also exposes battery — but as **binary** sensors (`device_class: battery`, HA
convention `on` = low, `off` = ok), with cryptic ids, mapped via the HA device registry:

- **RU02** wall thermostat → `binary_sensor.ru2161981184_battery` (the Tado room unit;
  corresponds to the app's single Thermostat card / `climate.woonkamer_woonkamer`).
- **6× VA02** smart radiator valves → `binary_sensor.va{0622409216,1093176832,1244302848,1529253376,4012412416,4149819136}_battery`. These have **no HA area/room assignment**, so they can't be placed on a specific card.

All currently report `off` (ok).

## Goal

- Show a small **battery icon on the Thermostat card** for the RU02 wall unit: ok
  (muted) normally, **red warning** when low. Binary (no %).
- Show a small **"radiator valve battery low"** warning (on the Thermostat card) that
  appears **only** when one or more of the 6 valves report low — with the count. Hidden
  when all are ok.

## Design

### Data (hardcoded, main-based)

- `config/devices.ts`:
  - `THERMOSTAT_BATTERY = "binary_sensor.ru2161981184_battery"`.
  - `VALVE_BATTERIES: string[]` = the 6 `binary_sensor.va…_battery` ids.
- `lib/types.ts` `ThermostatState`: add
  - `batteryLow: boolean | null` — RU02: `true` (on/low), `false` (off/ok), `null` (sensor missing/unavailable).
  - `valvesLow: number` — count of `VALVE_BATTERIES` whose state is `"on"` (low). `0` when none/unknown.
- `lib/state-mapper.ts` `mapThermostat`: read the RU02 binary sensor → `batteryLow`
  (`state === "on" → true`, `"off" → false`, missing/`unavailable`/`unknown` → `null`);
  count the valve sensors with `state === "on"` → `valvesLow`.

### Binary battery → icon (extend `lib/battery.ts`)

- Reuse the existing battery icon mapping. For a binary battery: `batteryLow === false`
  → an "ok" battery icon (BatteryFull, muted); `=== true` → BatteryWarning (red);
  `null` → no icon. This is a small inline mapping in the card (no new helper needed),
  consistent with the room-card icon styling (size ~15, `text-[var(--muted)]` / `text-[#e85f4c]`).

### UI (`app/components/ThermostatCard.tsx`)

- When `batteryLow != null`, render the battery icon next to the thermostat title:
  ok → `BatteryFull` muted; low → `BatteryWarning` red. `aria-label`/`title` =
  `"Battery OK"` / `"Battery low"` (or the i18n equivalents).
- When `valvesLow > 0`, render a small warning line (muted/amber, with a warning icon):
  - 1 → `t("thermostat.valveLowOne")` ("Radiator valve battery low" / "Radiatorknop batterij bijna leeg")
  - >1 → `t("thermostat.valveLowMany", { count })` ("{count} radiator valves battery low" / "{count} radiatorknoppen batterij bijna leeg")
- Nothing extra renders when `valvesLow === 0` and (battery ok shows a subtle icon, low shows red).

### i18n (`lib/i18n.ts`, en + nl)

`thermostat.batteryOk`, `thermostat.batteryLow`, `thermostat.valveLowOne`,
`thermostat.valveLowMany` (with `{count}`), in both locales.

## Non-goals

- Per-room placement of individual valves (no HA area mapping; cryptic ids). Deferred —
  a combined count is shown instead.
- % battery for Tado (HA only exposes binary low/ok).
- Touching the room-card battery (already done).

## Testing

- `mapThermostat`: `batteryLow` = true/false/null for RU02 on/off/missing; `valvesLow`
  counts only `"on"` valve sensors (0 when all off; N when N are on).
- `ThermostatCard`: renders the ok icon (muted, "Battery OK" label) when `batteryLow=false`;
  the red warning icon when `true`; no battery icon when `null`. Renders the valve warning
  with the right singular/plural text when `valvesLow` is 1 / >1; nothing when 0.
- Full suite + build green. Live check: thermostat shows an ok battery icon; valve warning
  absent (all valves currently ok).

## Rollout

Additive on the battery branch. No behavior change beyond the new icon + conditional
warning. Hardcoded ids (owner-specific, like the room battery map).
