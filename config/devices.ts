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

export function isAllowedScene(id: string): boolean {
  return HUE_SCENES.some((s) => s.id === id);
}

/** Resolve an allowed scene id to its HA service, or undefined if not on the allowlist. */
export function sceneService(id: string): SceneService | undefined {
  return HUE_SCENES.find((s) => s.id === id)?.service;
}

export function sceneList(): SceneRef[] {
  return HUE_SCENES.map((s) => ({ id: s.id, name: s.name }));
}
