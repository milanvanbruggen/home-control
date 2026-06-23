import type { ClimateDeviceConfig, SceneRef } from "@/lib/types";

export const CHILLS: readonly ClimateDeviceConfig[] = [
  { id: "climate.zolder", name: "Zolder", kind: "chill",
    actions: ["on_off", "set_mode", "set_fan", "set_temp"],
    statusSensor: "sensor.zolder_status" },
  { id: "climate.speelkamer", name: "Speelkamer", kind: "chill",
    actions: ["on_off", "set_mode", "set_fan", "set_temp"],
    statusSensor: "sensor.speelkamer_status" },
];

/** The Quatt thermostat is read-only in HA (no settable entity) — sourced from these sensors. */
export const THERMOSTAT_SENSORS = {
  name: "Thermostaat",
  roomTemp: "sensor.thermostat_room_temperature",
  setpoint: "sensor.thermostat_room_setpoint",
  heating: "binary_sensor.thermostat_heating",
  cooling: "binary_sensor.thermostat_cooling",
} as const;

/** Dimmable light groups the visitor app may control (brightness 0–100). */
export const LIGHTS = [{ id: "light.woonkamer", name: "Woonkamer" }] as const;

export function isAllowedLight(id: string): boolean {
  return LIGHTS.some((l) => l.id === id);
}

/** The HA service a scene button triggers (server-side only — never sent to the client). */
export interface SceneService {
  domain: string;
  service: string;
  data: Record<string, unknown>;
}

/** A scene button: a stable id + label (client-facing) plus the HA service it fires (server-only). */
export interface SceneDef extends SceneRef {
  service: SceneService;
}

/** A normal Hue scene button: tapping it calls scene.turn_on on that scene entity. */
function sceneOn(id: string, name: string): SceneDef {
  return { id, name, service: { domain: "scene", service: "turn_on", data: { entity_id: id } } };
}

export const HUE_SCENES: readonly SceneDef[] = [
  sceneOn("scene.woonkamer_pumpkin_spice", "Pumpkin Spice"),
  sceneOn("scene.woonkamer_ontspannen", "Ontspannen"),
  sceneOn("scene.woonkamer_aan_tafel", "Aan Tafel!"),
  sceneOn("scene.woonkamer_gedimd", "Gedimd"),
  sceneOn("scene.woonkamer_lezen", "Lezen"),
  sceneOn("scene.woonkamer_lentebloesem", "Lentebloesem"),
  sceneOn("scene.woonkamer_helder", "Helder"),
  // "Uit" is not a Hue scene — it turns the woonkamer light group off.
  { id: "woonkamer_uit", name: "Uit",
    service: { domain: "light", service: "turn_off", data: { entity_id: "light.woonkamer" } } },
];

export const CLIMATE_DEVICES: readonly ClimateDeviceConfig[] = [...CHILLS];

export function findClimateDevice(id: string): ClimateDeviceConfig | undefined {
  return CLIMATE_DEVICES.find((d) => d.id === id);
}

/** Every woonkamer Hue scene (for the "Alle scenes" modal). The favorites in HUE_SCENES are a subset. */
export const ALL_SCENES: readonly SceneRef[] = [
  { id: "scene.woonkamer_pumpkin_spice", name: "Pumpkin Spice" },
  { id: "scene.woonkamer_ontspannen", name: "Ontspannen" },
  { id: "scene.woonkamer_aan_tafel", name: "Aan Tafel!" },
  { id: "scene.woonkamer_gedimd", name: "Gedimd" },
  { id: "scene.woonkamer_lezen", name: "Lezen" },
  { id: "scene.woonkamer_lentebloesem", name: "Lentebloesem" },
  { id: "scene.woonkamer_helder", name: "Helder" },
  { id: "scene.woonkamer_nachtlampje", name: "Nachtlampje" },
  { id: "scene.woonkamer_maartje_s_bloementuin", name: "Maartje's bloementuin 🌺" },
  { id: "scene.woonkamer_arctische_dageraad", name: "Arctische dageraad" },
  { id: "scene.woonkamer_aan_tafel_2", name: "Aan tafel" },
  { id: "scene.woonkamer_energie", name: "Energie" },
  { id: "scene.woonkamer_tropische_schemering", name: "Tropische schemering" },
  { id: "scene.woonkamer_rusten", name: "Rusten" },
  { id: "scene.woonkamer_vlammen", name: "Vlammen" },
  { id: "scene.woonkamer_bas_nibbit_monster", name: "Bas Nibbit-monster" },
  { id: "scene.woonkamer_concentreren", name: "Concentreren" },
  { id: "scene.woonkamer_savannah_zon", name: "Savannah zon" },
  { id: "scene.woonkamer_milan_kom_naar_bed", name: "Milan kom naar bed!" },
  { id: "scene.woonkamer_kerstmis", name: "Kerstmis" },
  { id: "scene.woonkamer_de_jongens", name: "De jongens" },
  { id: "scene.woonkamer_leuke_familie", name: "Leuke familie" },
  { id: "scene.woonkamer_natuurlijk_licht", name: "Natuurlijk licht" },
];

export function isAllowedScene(id: string): boolean {
  return HUE_SCENES.some((s) => s.id === id) || ALL_SCENES.some((s) => s.id === id);
}

/** Resolve an allowed scene id to its HA service, or undefined if not on the allowlist. */
export function sceneService(id: string): SceneService | undefined {
  const favorite = HUE_SCENES.find((s) => s.id === id);
  if (favorite) return favorite.service;
  if (ALL_SCENES.some((s) => s.id === id)) {
    return { domain: "scene", service: "turn_on", data: { entity_id: id } };
  }
  return undefined;
}

/** Favorite scenes shown in the grid. */
export function sceneList(): SceneRef[] {
  return HUE_SCENES.map((s) => ({ id: s.id, name: s.name }));
}

/** All woonkamer scenes shown in the "Alle scenes" modal. */
export function allSceneList(): SceneRef[] {
  return ALL_SCENES.map((s) => ({ id: s.id, name: s.name }));
}
