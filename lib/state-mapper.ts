import type { AppState, ChillState, ThermostatState, HaEntityState, HvacMode } from "@/lib/types";
import { CHILLS, THERMOSTAT, sceneList } from "@/config/devices";
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

function mapThermostat(e: HaEntityState | undefined): ThermostatState {
  const { id, name } = THERMOSTAT;
  if (!e || e.state === "unavailable") {
    return { id, name, available: false, temp: null, current: null, min: 5, max: 30, step: 0.5 };
  }
  const a = e.attributes;
  return {
    id, name, available: true,
    temp: num(a.temperature, null),
    current: num(a.current_temperature, null),
    min: num(a.min_temp, 5) as number,
    max: num(a.max_temp, 30) as number,
    step: num(a.target_temp_step, 0.5) as number,
  };
}

export function mapHaStatesToAppState(states: HaEntityState[]): AppState {
  const byId = new Map(states.map((s) => [s.entity_id, s]));
  return {
    chills: CHILLS.map((c) => mapChill(c.name, c.id, byId.get(c.id))),
    thermostat: mapThermostat(byId.get(THERMOSTAT.id)),
    scenes: sceneList(),
  };
}

export function findClimateRuntime(app: AppState, id: string): ClimateRuntime | undefined {
  if (app.thermostat && app.thermostat.id === id) return app.thermostat;
  return app.chills.find((c) => c.id === id);
}
