import type { AppState, ChillState, ThermostatState, HaEntityState, HvacMode, ClimateDeviceConfig, RoomState, SceneRef } from "@/lib/types";
import { CHILLS, THERMOSTAT_SENSORS, ROOMS, type Room } from "@/config/devices";
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

/** Build a room: its dimmable light group state + its scenes (grouped from HA) + active scene. */
function mapRoom(
  room: Room,
  byId: Map<string, HaEntityState>,
  states: HaEntityState[],
  activeScenes: Record<string, string | null>,
): RoomState {
  const e = byId.get(room.lightGroup);
  const on = !!e && e.state === "on";
  const b = e ? num(e.attributes.brightness, null) : null;
  const brightness = b != null ? Math.round((b / 255) * 100) : 0;

  // A scene belongs to this room when group_type is "room" and group_name matches.
  const roomScenes: SceneRef[] = states
    .filter(
      (s) =>
        s.entity_id.startsWith("scene.") &&
        s.attributes.group_type === "room" &&
        s.attributes.group_name === room.groupName,
    )
    .map((s) => ({
      id: s.entity_id,
      name: str(s.attributes.name, null) ?? str(s.attributes.friendly_name, s.entity_id) ?? s.entity_id,
    }));

  // Favorites first (woonkamer), then the rest alphabetically.
  const favIds = room.favorites ?? [];
  const favs = favIds
    .map((id) => roomScenes.find((s) => s.id === id))
    .filter((s): s is SceneRef => !!s);
  const rest = roomScenes
    .filter((s) => !favIds.includes(s.id))
    .sort((a, b) => a.name.localeCompare(b.name));

  return {
    key: room.key,
    name: room.name,
    lightId: room.lightGroup,
    on,
    brightness,
    scenes: [...favs, ...rest],
    activeScene: activeScenes[room.key] ?? null,
  };
}

export function mapHaStatesToAppState(
  states: HaEntityState[],
  activeScenes: Record<string, string | null> = {},
): AppState {
  const byId = new Map(states.map((s) => [s.entity_id, s]));
  return {
    chills: CHILLS.map((c) => mapChill(c, byId)),
    thermostat: mapThermostat(byId),
    rooms: ROOMS.map((r) => mapRoom(r, byId, states, activeScenes)),
  };
}

export function findClimateRuntime(app: AppState, id: string): ClimateRuntime | undefined {
  return app.chills.find((c) => c.id === id);
}
