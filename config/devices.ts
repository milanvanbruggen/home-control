import type { ClimateDeviceConfig, MetricKind, MetricSensor } from "@/lib/types";

export const CHILLS: readonly ClimateDeviceConfig[] = [
  { id: "climate.zolder", name: "Zolder", kind: "chill",
    actions: ["on_off", "set_mode", "set_fan", "set_temp"],
    statusSensor: "sensor.zolder_status",
    waterSensor: "binary_sensor.zolder_water_tank_warning" },
  { id: "climate.speelkamer", name: "Speelkamer", kind: "chill",
    actions: ["on_off", "set_mode", "set_fan", "set_temp"],
    statusSensor: "sensor.speelkamer_status",
    waterSensor: "binary_sensor.speelkamer_water_tank_warning" },
];

/**
 * The living-room Tado thermostat — controllable via the climate entity.
 * Guests may turn it on/off and adjust its target temperature (no mode/fan).
 */
export const THERMOSTAT: ClimateDeviceConfig = {
  id: "climate.woonkamer_woonkamer", name: "Thermostaat", kind: "thermostat", actions: ["on_off", "set_temp"],
};

export const CLIMATE_DEVICES: readonly ClimateDeviceConfig[] = [...CHILLS, THERMOSTAT];

/**
 * Water-reservoir alert: when a Quatt `waterSensor` turns on, the server watcher
 * shows this on the LaMetric in the house (HA `notify.my_lametric`). `sound` and
 * `icon` are LaMetric ids (sound must be a string; icon is a LaMetric icon id).
 */
export const WATER_ALERT = {
  notifyDomain: "notify",
  notifyService: "my_lametric",
  sound: "alarm13",
  icon: "8990",
  // Pressed (button.press) to clear the LaMetric alert once all tanks are empty.
  dismissEntity: "button.my_lametric_dismiss_all_notifications",
} as const;

export function findClimateDevice(id: string): ClimateDeviceConfig | undefined {
  return CLIMATE_DEVICES.find((d) => d.id === id);
}

/**
 * A controllable Hue room: a dimmable light group + its scenes (read dynamically
 * from HA). `groupName` is the HA scene `group_name` used to find that room's scenes.
 * `favorites` (woonkamer) are scene ids shown first in the grid.
 */
export interface Room {
  key: string;
  name: string;
  lightGroup: string;
  groupName: string;
  favorites?: readonly string[];
}

export const ROOMS: readonly Room[] = [
  {
    key: "woonkamer", name: "Woonkamer", lightGroup: "light.woonkamer", groupName: "Woonkamer",
    favorites: [
      "scene.woonkamer_pumpkin_spice", "scene.woonkamer_ontspannen", "scene.woonkamer_aan_tafel",
      "scene.woonkamer_gedimd", "scene.woonkamer_lezen", "scene.woonkamer_lentebloesem", "scene.woonkamer_helder",
    ],
  },
  { key: "keuken", name: "Keuken", lightGroup: "light.keuken", groupName: "Keuken" },
  { key: "slaapkamer", name: "Slaapkamer", lightGroup: "light.slaapkamer_2", groupName: "Slaapkamer" },
  { key: "slaapkamer_bas", name: "Slaapkamer Bas", lightGroup: "light.slaapkamer_bas", groupName: "Slaapkamer Bas" },
  { key: "slaapkamer_thijs", name: "Slaapkamer Thijs", lightGroup: "light.slaapkamer_thijs", groupName: "Slaapkamer Thijs" },
  { key: "werkkamer", name: "Werkkamer", lightGroup: "light.werkkamer", groupName: "Werkkamer" },
  { key: "overloop", name: "Overloop 1e Verdieping", lightGroup: "light.overloop_1e_verdieping", groupName: "Overloop 1e Verdieping" },
];

/** Group names of the rooms the visitor app may control — the scene allowlist boundary. */
export const ALLOWED_ROOM_GROUP_NAMES: ReadonlySet<string> = new Set(ROOMS.map((r) => r.groupName));

/**
 * Every Hue room light-group in the house — what the whole-house "Alle lampen uit"
 * turns off. Explicit list (HA's `entity_id: "all"` magic is unreliable in newer HA).
 */
export const ALL_LIGHT_GROUPS: readonly string[] = [
  "light.woonkamer", "light.keuken", "light.gang", "light.overloop_1e_verdieping",
  "light.belcel", "light.slaapkamer_thijs", "light.werkkamer", "light.slaapkamer_2",
  "light.slaapkamer_bas", "light.dressoir",
];

export function findRoomByKey(key: string): Room | undefined {
  return ROOMS.find((r) => r.key === key);
}
export function findRoomByGroupName(name: string): Room | undefined {
  return ROOMS.find((r) => r.groupName === name);
}
export function findRoomByLightGroup(id: string): Room | undefined {
  return ROOMS.find((r) => r.lightGroup === id);
}

/** Grid favorites for a room when the settings store has none: the room's
 * configured favorites, else the first six of its scenes. */
export function defaultFavorites(room: Room, sceneIds: readonly string[]): string[] {
  return room.favorites ? [...room.favorites] : sceneIds.slice(0, 6);
}

/** A light target is allowed iff it's one of the room groups, or "all" (whole-house off). */
export function isAllowedLight(id: string): boolean {
  return id === "all" || ROOMS.some((r) => r.lightGroup === id);
}

/** Per-room "Uit" sentinel id (turns that room's light group off). */
export function roomUitId(key: string): string {
  return `${key}_uit`;
}

/** If id is a "<key>_uit" sentinel for an allowed room, return that room; else undefined. */
export function parseRoomUit(id: string): Room | undefined {
  if (!id.endsWith("_uit")) return undefined;
  return findRoomByKey(id.slice(0, -"_uit".length));
}

/**
 * Environmental metric sensors per room, surfaced as home-screen widgets.
 * Entity ids are the real Home Assistant sensors. Keys reuse the Hue room key
 * where it's the same physical room; new keys (kamer_bas/zolder/speelkamer/buiten)
 * are metric-only. Add a sensor here and it appears (visible by default).
 */
export interface MetricRoom {
  key: string;
  name: string;
  sensors: readonly MetricSensor[];
}

export const METRIC_KINDS: readonly MetricKind[] = ["temperature", "humidity"];

export const ROOM_METRICS: readonly MetricRoom[] = [
  { key: "woonkamer", name: "Woonkamer", sensors: [
    { kind: "temperature", entityId: "sensor.woonkamer_woonkamer_temperature" },
    { kind: "humidity",    entityId: "sensor.woonkamer_woonkamer_humidity" },
  ] },
  { key: "slaapkamer", name: "Slaapkamer", sensors: [
    { kind: "temperature", entityId: "sensor.slaapkamer_maartje_en_milan_slaapkamer_maartje_en_milan_temperature" },
    { kind: "humidity",    entityId: "sensor.slaapkamer_maartje_en_milan_slaapkamer_maartje_en_milan_humidity" },
  ] },
  { key: "slaapkamer_bas", name: "Slaapkamer Bas", sensors: [
    { kind: "temperature", entityId: "sensor.slaapkamer_bas_slaapkamer_bas_temperature" },
    { kind: "humidity",    entityId: "sensor.slaapkamer_bas_slaapkamer_bas_humidity" },
  ] },
  { key: "slaapkamer_thijs", name: "Slaapkamer Thijs", sensors: [
    { kind: "temperature", entityId: "sensor.slaapkamer_thijs_slaapkamer_thijs_temperature" },
    { kind: "humidity",    entityId: "sensor.slaapkamer_thijs_slaapkamer_thijs_humidity" },
  ] },
  { key: "kamer_bas", name: "Kamer Bas", sensors: [
    { kind: "temperature", entityId: "sensor.kamer_bas_temperatuur" },
    { kind: "humidity",    entityId: "sensor.kamer_bas_luchtvochtigheid" },
  ] },
  { key: "zolder", name: "Zolder", sensors: [
    { kind: "temperature", entityId: "sensor.zolder_ambient_temperature" },
  ] },
  { key: "speelkamer", name: "Speelkamer", sensors: [
    { kind: "temperature", entityId: "sensor.speelkamer_ambient_temperature" },
  ] },
  { key: "buiten", name: "Buiten", sensors: [
    { kind: "temperature", entityId: "sensor.home_outdoor_temperature" },
  ] },
];

export const METRIC_ROOM_KEYS: ReadonlySet<string> = new Set(ROOM_METRICS.map((r) => r.key));
