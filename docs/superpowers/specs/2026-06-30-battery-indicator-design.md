# Battery indicator on room cards

**Date:** 2026-06-30
**Status:** Approved design. Built on a branch off `main` (`feat/battery-indicator`).

## Context

Some devices are battery-powered. In this user's Home Assistant the battery level is a
separate sensor, not an attribute on the device. The only cleanly-named battery sensors
are the three Hue dial switches: `sensor.dial_switch_{woonkamer,keuken,slaapkamer}_battery`
(% level), which correspond to those three room cards. (The Tado thermostat and wireless
temp/humidity sensors only expose cryptic `binary_sensor.va*/ru*_battery` low-battery
flags with unmappable ids — out of scope unless the owner provides the mapping.)

## Goal

Show a small **battery icon** on a room's card when that room has a configured battery
sensor, reflecting the level by icon shape, emphasised (red) when low. Icon only — no
number (the % is exposed via tooltip/aria for accessibility).

## Design

### Data (hardcoded mapping, main has no device config)

- `config/devices.ts`: a `ROOM_BATTERY: Record<string, string>` map, room key → battery
  sensor entity id:
  - `woonkamer → sensor.dial_switch_woonkamer_battery`
  - `keuken → sensor.dial_switch_keuken_battery`
  - `slaapkamer → sensor.dial_switch_slaapkamer_battery`
- `lib/types.ts` `RoomState`: add `batteryPct: number | null`.
- `lib/state-mapper.ts` `mapRoom`: set `batteryPct = numericState(byId.get(ROOM_BATTERY[room.key]))` clamped to 0–100, or `null` when the room has no mapping or the sensor is missing/unavailable.

### Battery level → icon (pure helper)

- `lib/battery.ts`: `batteryLevel(pct: number): { level: "full" | "medium" | "low" | "warning"; low: boolean }`:
  - `>= 60 → full`, `>= 30 → medium`, `>= 10 → low`, `< 10 → warning`. `low` is true for `< 20` (drives the red emphasis).
- Pure + unit-tested at the thresholds.

### UI (room card header — `app/components/LightScenes.tsx`)

- When `current.batteryPct != null`, render a small lucide battery icon next to the room
  name/switcher in the card header:
  - `full → BatteryFull`, `medium → BatteryMedium`, `low → BatteryLow`, `warning → BatteryWarning`.
  - Size ~14–16px, muted colour (`text-[var(--muted)]`) normally; red (`text-[#e85f4c]`) when `low`.
  - `title` + `aria-label` = `"Battery {pct}%"` (the only place the number appears).
- Rooms without a battery sensor (`batteryPct === null`) render nothing — no clutter.

## Non-goals

- Climate / metric-sensor batteries (cryptic unmappable ids) — deferred; owner can supply
  a mapping later.
- Battery for the whole dashboard / a settings toggle. Always shown when present.
- This is a `main`-targeted, hardcoded mapping (owner-specific by design). The configurable
  per-device version lives conceptually on the `feat/device-config-foundation` branch (an
  optional `batterySensor` field) — not built here.

## Testing

- `lib/battery.ts`: `batteryLevel` returns the right level + `low` flag at boundaries
  (60/30/20/10, and edges like 0/100).
- `lib/state-mapper.ts`: `mapRoom` sets `batteryPct` from the mapped sensor; `null` for a
  room with no mapping and for a missing/unavailable sensor.
- `app/components/LightScenes.tsx`: renders the battery icon (with the % in its aria-label)
  when the current room has `batteryPct`; renders no battery icon when `batteryPct` is null.
- Full suite + build green. Live check: the dial-switch battery % shows on the
  woonkamer/keuken/slaapkamer cards.

## Rollout

Additive: a new optional `RoomState` field + a card icon. No behavior change elsewhere.
Targeted at `main` via a branch; merges cleanly. Deploy needs an add-on version bump (as usual).
