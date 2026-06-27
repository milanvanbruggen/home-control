# Solar card: hold last-good production through brief SolarEdge dropouts

**Date:** 2026-06-27
**Status:** Approved design, ready for implementation plan

## Problem

The Solar card shows "Unavailable" intermittently during the day. Verified against
live Home Assistant: the SolarEdge integration flaps to `unavailable` roughly every
couple of hours for ~15 minutes, then recovers (observed transitions on 2026-06-27:
05:25, 06:40, 10:11, 13:11, 14:41 — each ~15 min). During a dropout BOTH SolarEdge
sensors go null:

- `sensor.solaredge_current_power` → `currentPowerW`
- `sensor.solaredge_lifetime_energy` → `lifetimeKwh`

`mapSolar` sets `available: power != null || lifetimeWh != null` → `false`, and
`SolarCard` replaces the entire card with the "Unavailable" message — even though the
weather backdrop, grid net (P1 meter), coverage %, and the history chart/total (from
`/api/solar-history`, backed by the recorder) are all still live. This is a known
SolarEdge cloud-API reliability pattern, upstream of this app; the app reflects it
faithfully but harshly.

## Goal

During a brief SolarEdge dropout, keep the card rendering by holding the last-good
SolarEdge production fields, so a transient `unavailable` no longer blanks the card.
Seamless — the held value renders as if live (no staleness indicator).

## Non-goals

- No fix for the SolarEdge integration flakiness itself (that lives in HA/SolarEdge).
- No UI changes to `SolarCard` (the user chose seamless; no staleness hint).
- Do **not** hold the weather backdrop, grid net, or coverage % — those come from
  other sensors that stay live during a SolarEdge dropout and must remain fresh.
- No indefinite hold: beyond the staleness window, show the honest "Unavailable".

## Design

Server-side, mirroring the existing `lib/chill-mode.ts` "remember last-good across
polls" pattern (module-level in-memory state, single Node process, reset on restart).

**New `lib/solar-hold.ts`:**

- Module state: the last-good snapshot `{ currentPowerW: number | null, lifetimeKwh:
  number | null, at: number } | null`.
- `applySolarHold(solar: SolarState, nowMs: number, windowMs?: number): void`
  — mutates `solar` in place (same convention as `applySunStrength`):
  - If `solar.available` → refresh the snapshot from `solar.currentPowerW` /
    `solar.lifetimeKwh` with `at = nowMs`; return (no restore).
  - Else if a snapshot exists and `nowMs - snapshot.at <= windowMs` → restore
    `solar.currentPowerW` and `solar.lifetimeKwh` from the snapshot and set
    `solar.available = currentPowerW != null || lifetimeKwh != null` (true, since the
    snapshot was taken while available).
  - Else → leave `solar` untouched (genuinely unavailable).
- `clearSolarHold(): void` — reset module state (test isolation).
- `windowMs` default: `SOLAR_HOLD_WINDOW_MS = 30 * 60 * 1000` (30 min). Covers the
  ~15-min dropouts; a genuine multi-hour outage still surfaces "Unavailable".

**Route wiring** (`app/api/state/route.ts`): one call after `applySunStrength(...)`,
before `Response.json(app)`:

```ts
applySolarHold(app.solar, Date.now());
```

Order note: `applySunStrength` no-ops during a dropout (power null → production-null),
so the two are order-independent; placing the hold last is clearest.

**Selective hold:** only `currentPowerW` and `lifetimeKwh` are held. `sky`,
`netGridKw`/`gridDirection` (P1), and `coveragePct` (`home_solar_percentage`) are left
as freshly mapped — they stay live during a SolarEdge dropout.

## Edge cases

- Cold start (no snapshot yet) + sensors unavailable → no restore → "Unavailable"
  (correct; nothing good to show yet).
- Partial dropout (one SolarEdge sensor present) → `available` already true → the
  snapshot refreshes; no restore needed.
- Snapshot older than the window → no restore → honest "Unavailable".
- Server restart clears the snapshot (in-memory) — acceptable, same as `chill-mode`.

## Testing

`lib/solar-hold.test.ts` (pure, with an injected `nowMs`):

- Snapshots when available; returns the solar unchanged.
- Restores `currentPowerW` + `lifetimeKwh` and flips `available` true when both are
  null and a fresh snapshot exists.
- Does NOT restore when the snapshot is older than the window → stays unavailable.
- Does nothing on cold start (no snapshot) → stays unavailable.
- Leaves `sky` / `netGridKw` / `coveragePct` untouched when restoring (live fields
  stay fresh).

`app/api/state/route.test.ts` (integration, two sequential polls):

- Poll 1: SolarEdge sensors present → response `available: true` (seeds the hold).
- Poll 2: SolarEdge sensors `unavailable` → response still `available: true` with the
  held `currentPowerW` from poll 1. `clearSolarHold()` in `beforeEach` for isolation.

## Rollout

Purely additive + server-side. With no snapshot (fresh boot) behavior is identical to
today. Deploy needs an add-on version bump (→ next after 1.2.0) so HA rebuilds.
