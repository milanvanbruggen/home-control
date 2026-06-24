import type { ClimateDeviceConfig } from "@/lib/types";

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
 * Guests may only adjust its target temperature (no mode/fan switching).
 */
export const THERMOSTAT: ClimateDeviceConfig = {
  id: "climate.woonkamer_woonkamer", name: "Thermostaat", kind: "thermostat", actions: ["set_temp"],
};

export const CLIMATE_DEVICES: readonly ClimateDeviceConfig[] = [...CHILLS, THERMOSTAT];

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
