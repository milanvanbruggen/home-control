import type { ClimateDeviceConfig, SceneRef } from "@/lib/types";

export const CHILLS: readonly ClimateDeviceConfig[] = [
  { id: "climate.zolder_chill", name: "Zolder", kind: "chill",
    actions: ["on_off", "set_mode", "set_fan", "set_temp"] },
  { id: "climate.speelkamer_chill", name: "Speelkamer", kind: "chill",
    actions: ["on_off", "set_mode", "set_fan", "set_temp"] },
];

export const THERMOSTAT: ClimateDeviceConfig = {
  id: "climate.thermostaat", name: "Thermostaat", kind: "thermostat",
  actions: ["set_temp"],
};

export const HUE_SCENES: readonly SceneRef[] = [
  { id: "scene.woonkamer_pumpkin_spice", name: "Pumpkin Spice" },
  { id: "scene.woonkamer_ontspannen", name: "Ontspannen" },
  { id: "scene.woonkamer_aan_tafel", name: "Aan Tafel!" },
  { id: "scene.woonkamer_gedimd", name: "Gedimd" },
  { id: "scene.woonkamer_lezen", name: "Lezen" },
  { id: "scene.woonkamer_lentebloesem", name: "Lentebloesem" },
  { id: "scene.woonkamer_helder", name: "Helder" },
  { id: "scene.woonkamer_uit", name: "Uit" },
];

export const CLIMATE_DEVICES: readonly ClimateDeviceConfig[] = [...CHILLS, THERMOSTAT];

export function findClimateDevice(id: string): ClimateDeviceConfig | undefined {
  return CLIMATE_DEVICES.find((d) => d.id === id);
}

export function isAllowedScene(id: string): boolean {
  return HUE_SCENES.some((s) => s.id === id);
}

export function sceneList(): SceneRef[] {
  return HUE_SCENES.map((s) => ({ id: s.id, name: s.name }));
}
