import type { AppState, ChillState, ThermostatState, HaEntityState, HvacMode } from "@/lib/types";
import { CHILLS, THERMOSTAT_SENSORS, sceneList } from "@/config/devices";
import type { ClimateRuntime } from "@/lib/climate";

function num(v: unknown, fallback: number | null): number | null {
  return typeof v === "number" && !Number.isNaN(v) ? v : fallback;
}

function str(v: unknown, fallback: string | null): string | null {
  return typeof v === "string" ? v : fallback;
}

function strArray(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
}

function toMode(state: string): HvacMode {
  return state === "cool" || state === "heat" ? state : "off";
}

/** Parse a numeric HA entity *state* string (e.g. a sensor), or null if not a finite number. */
function numState(e: HaEntityState | undefined): number | null {
  if (!e) return null;
  const n = Number(e.state);
  return Number.isFinite(n) ? n : null;
}

function mapChill(name: string, id: string, e: HaEntityState | undefined): ChillState {
  if (!e || e.state === "unavailable") {
    return {
      id, name, available: false, on: false, mode: "off", temp: null, current: null,
      fan: null, min: 16, max: 30, step: 1, fanOptions: [],
    };
  }
  const a = e.attributes;
  return {
    id, name, available: true,
    on: e.state !== "off",
    mode: toMode(e.state),
    temp: num(a.temperature, null),
    current: num(a.current_temperature, null),
    fan: str(a.fan_mode, null),
    min: num(a.min_temp, 16) as number,
    max: num(a.max_temp, 30) as number,
    step: num(a.target_temp_step, 1) as number,
    fanOptions: strArray(a.fan_modes),
  };
}

/** The Quatt thermostat is read-only — built from sensor + binary_sensor states. */
function mapThermostat(byId: Map<string, HaEntityState>): ThermostatState {
  const t = THERMOSTAT_SENSORS;
  const room = byId.get(t.roomTemp);
  const available = !!room && room.state !== "unavailable" && room.state !== "unknown";
  const heatingOn = byId.get(t.heating)?.state === "on";
  const coolingOn = byId.get(t.cooling)?.state === "on";
  return {
    name: t.name,
    available,
    current: numState(room),
    setpoint: numState(byId.get(t.setpoint)),
    status: heatingOn ? "heating" : coolingOn ? "cooling" : "idle",
  };
}

export function mapHaStatesToAppState(states: HaEntityState[]): AppState {
  const byId = new Map(states.map((s) => [s.entity_id, s]));
  return {
    chills: CHILLS.map((c) => mapChill(c.name, c.id, byId.get(c.id))),
    thermostat: mapThermostat(byId),
    scenes: sceneList(),
  };
}

export function findClimateRuntime(app: AppState, id: string): ClimateRuntime | undefined {
  return app.chills.find((c) => c.id === id);
}
