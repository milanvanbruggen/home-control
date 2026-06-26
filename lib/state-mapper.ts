import type { AppState, ChillState, ThermostatState, HaEntityState, HvacMode, ClimateDeviceConfig, RoomState, SceneRef, MetricValue, RoomMetrics, SolarState, GridDirection } from "@/lib/types";
import { CHILLS, THERMOSTAT, ROOMS, ROOM_METRICS, SOLAR, defaultFavorites, type Room } from "@/config/devices";
import type { ClimateRuntime } from "@/lib/climate";
import { sceneKey } from "@/lib/hue-color";
import { numericState, METRIC_UNIT_FALLBACK } from "@/lib/metrics";

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
      fan: null, min: 16, max: 30, step: 1, fanOptions: [], status, waterWarning, lastMode: null,
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
    lastMode: e.state === "cool" ? "cool" : e.state === "heat" ? "heat" : null,
  };
}

/**
 * The living-room Tado thermostat — controllable via the climate entity.
 * `current` = room temp, `setpoint` = target temp, status from `hvac_action`.
 * Step is fixed at 0.5°C for guests (HA reports a finicky 0.1° step).
 */
function mapThermostat(byId: Map<string, HaEntityState>): ThermostatState {
  const e = byId.get(THERMOSTAT.id);
  const a: Record<string, unknown> = e?.attributes ?? {};
  const available = !!e && e.state !== "unavailable" && e.state !== "unknown";
  const action = a.hvac_action;
  return {
    id: THERMOSTAT.id,
    name: THERMOSTAT.name,
    available,
    current: num(a.current_temperature, null),
    setpoint: num(a.temperature, null),
    min: num(a.min_temp, 5) as number,
    max: num(a.max_temp, 25) as number,
    step: 0.5,
    status:
      e?.state === "off" ? "off"
      : action === "heating" ? "heating"
      : action === "cooling" ? "cooling"
      : "idle",
  };
}

/** Build a room: its dimmable light group state + its scenes (grouped from HA) + active scene. */
function mapRoom(
  room: Room,
  byId: Map<string, HaEntityState>,
  states: HaEntityState[],
  activeScenes: Record<string, string | null>,
  settingsFavorites: Record<string, string[]>,
  sceneGradients: Record<string, string>,
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
    .map((s) => {
      const name = str(s.attributes.name, null) ?? str(s.attributes.friendly_name, s.entity_id) ?? s.entity_id;
      const gradient = sceneGradients[sceneKey(room.groupName, name)];
      return gradient ? { id: s.entity_id, name, gradient } : { id: s.entity_id, name };
    });

  // Scenes ordered favorites-first (config), then the rest alphabetically.
  const favIds = room.favorites ?? [];
  const favs = favIds
    .map((id) => roomScenes.find((s) => s.id === id))
    .filter((s): s is SceneRef => !!s);
  const rest = roomScenes
    .filter((s) => !favIds.includes(s.id))
    .sort((a, b) => a.name.localeCompare(b.name));
  const scenes = [...favs, ...rest];
  const sceneIds = scenes.map((s) => s.id);

  // Grid favorites: from the settings store if set, else the config/default;
  // keep only ids that still exist as scenes (drop stale), preserving order.
  const favorites = (settingsFavorites[room.key] ?? defaultFavorites(room, sceneIds)).filter((id) =>
    sceneIds.includes(id),
  );

  return {
    key: room.key,
    name: room.name,
    lightId: room.lightGroup,
    on,
    brightness,
    scenes,
    favorites,
    activeScene: activeScenes[room.key] ?? null,
  };
}

/** Build the per-room metric widgets from the configured sensors + the hidden deny-list. */
function mapMetrics(byId: Map<string, HaEntityState>, hidden: Record<string, string[]>): RoomMetrics[] {
  return ROOM_METRICS.map((room) => {
    const hiddenKinds = hidden[room.key] ?? [];
    const metrics: MetricValue[] = room.sensors.map((s) => {
      const e = byId.get(s.entityId);
      const value = numericState(e);
      const unitAttr = e?.attributes.unit_of_measurement;
      const unit = typeof unitAttr === "string" ? unitAttr : METRIC_UNIT_FALLBACK[s.kind];
      return { kind: s.kind, value, unit, visible: !hiddenKinds.includes(s.kind) };
    });
    return { key: room.key, name: room.name, metrics };
  });
}

function mapSolar(byId: Map<string, HaEntityState>): SolarState {
  const power = numericState(byId.get(SOLAR.currentPower));         // W
  const lifetimeWh = numericState(byId.get(SOLAR.lifetimeEnergy));  // Wh
  const coverage = numericState(byId.get(SOLAR.coverage));          // %
  const consumption = numericState(byId.get(SOLAR.gridConsumption)); // kW (afname)
  const production = numericState(byId.get(SOLAR.gridProduction));   // kW (teruglevering)

  const net =
    consumption != null && production != null
      ? Math.round((consumption - production) * 100) / 100
      : null;
  const direction: GridDirection =
    net == null ? "idle" : net > 0.01 ? "import" : net < -0.01 ? "export" : "idle";

  return {
    available: power != null || lifetimeWh != null,
    currentPowerW: power,
    netGridKw: net,
    gridDirection: direction,
    coveragePct: coverage != null ? Math.max(0, Math.min(100, coverage)) : null,
    lifetimeKwh: lifetimeWh != null ? Math.round(lifetimeWh / 1000) : null,
  };
}

export function mapHaStatesToAppState(
  states: HaEntityState[],
  activeScenes: Record<string, string | null> = {},
  favorites: Record<string, string[]> = {},
  sceneGradients: Record<string, string> = {},
  hiddenMetrics: Record<string, string[]> = {},
): AppState {
  const byId = new Map(states.map((s) => [s.entity_id, s]));
  return {
    chills: CHILLS.map((c) => mapChill(c, byId)),
    thermostat: mapThermostat(byId),
    rooms: ROOMS.map((r) => mapRoom(r, byId, states, activeScenes, favorites, sceneGradients)),
    metrics: mapMetrics(byId, hiddenMetrics),
    solar: mapSolar(byId),
  };
}

export function findClimateRuntime(app: AppState, id: string): ClimateRuntime | undefined {
  if (app.thermostat && app.thermostat.id === id) return app.thermostat;
  return app.chills.find((c) => c.id === id);
}
