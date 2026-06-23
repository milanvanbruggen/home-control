import type { AppState, ChillState, ThermostatState, HaEntityState, HvacMode, ClimateDeviceConfig, LightState } from "@/lib/types";
import { CHILLS, THERMOSTAT_SENSORS, LIGHTS, sceneList, allSceneList } from "@/config/devices";
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

/** Read a Quatt status sensor's text, or null if missing/unknown. */
function statusFrom(e: HaEntityState | undefined): string | null {
  if (!e || e.state === "unavailable" || e.state === "unknown") return null;
  return e.state;
}

function mapChill(c: ClimateDeviceConfig, byId: Map<string, HaEntityState>): ChillState {
  const e = byId.get(c.id);
  const status = c.statusSensor ? statusFrom(byId.get(c.statusSensor)) : null;
  const waterWarning = c.waterSensor ? byId.get(c.waterSensor)?.state === "on" : false;
  if (!e || e.state === "unavailable") {
    return {
      id: c.id, name: c.name, available: false, on: false, mode: "off", temp: null, current: null,
      fan: null, min: 16, max: 30, step: 1, fanOptions: [], status, waterWarning,
    };
  }
  const a = e.attributes;
  return {
    id: c.id, name: c.name, available: true,
    on: e.state !== "off",
    mode: toMode(e.state),
    temp: num(a.temperature, null),
    current: num(a.current_temperature, null),
    fan: str(a.fan_mode, null),
    min: num(a.min_temp, 16) as number,
    max: num(a.max_temp, 30) as number,
    step: num(a.target_temp_step, 1) as number,
    fanOptions: strArray(a.fan_modes),
    status,
    waterWarning,
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

/** A dimmable light group: on/off + brightness as a 0–100 percentage. */
function mapLight(l: { id: string; name: string }, byId: Map<string, HaEntityState>): LightState {
  const e = byId.get(l.id);
  const on = !!e && e.state === "on";
  const b = e ? num(e.attributes.brightness, null) : null;
  return { id: l.id, name: l.name, on, brightness: b != null ? Math.round((b / 255) * 100) : 0 };
}

export function mapHaStatesToAppState(states: HaEntityState[], activeScene: string | null = null): AppState {
  const byId = new Map(states.map((s) => [s.entity_id, s]));
  return {
    chills: CHILLS.map((c) => mapChill(c, byId)),
    thermostat: mapThermostat(byId),
    scenes: sceneList(),
    allScenes: allSceneList(),
    lights: LIGHTS.map((l) => mapLight(l, byId)),
    activeScene,
  };
}

export function findClimateRuntime(app: AppState, id: string): ClimateRuntime | undefined {
  return app.chills.find((c) => c.id === id);
}
