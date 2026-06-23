import { describe, it, expect } from "vitest";
import {
  CHILLS, THERMOSTAT_SENSORS, HUE_SCENES,
  findClimateDevice, isAllowedScene, sceneList, sceneService, allSceneList,
} from "@/config/devices";

describe("device allowlist", () => {
  it("has two chills and a read-only thermostat sensor config", () => {
    expect(CHILLS).toHaveLength(2);
    expect(THERMOSTAT_SENSORS.name).toBe("Thermostaat");
    expect(THERMOSTAT_SENSORS.roomTemp).toBe("sensor.thermostat_room_temperature");
  });

  it("has exactly the 8 woonkamer hue scenes with unique ids", () => {
    expect(HUE_SCENES).toHaveLength(8);
    const ids = HUE_SCENES.map((s) => s.id);
    expect(new Set(ids).size).toBe(8);
    expect(HUE_SCENES.map((s) => s.name)).toEqual([
      "Pumpkin Spice", "Ontspannen", "Aan Tafel!", "Gedimd",
      "Lezen", "Lentebloesem", "Helder", "Uit",
    ]);
  });

  it("finds whitelisted climate devices and rejects others", () => {
    expect(findClimateDevice("climate.zolder")?.kind).toBe("chill");
    expect(findClimateDevice("climate.thermostaat")).toBeUndefined();
    expect(findClimateDevice("climate.evil")).toBeUndefined();
  });

  it("allows favorites, all woonkamer scenes, and Uit — but not others", () => {
    expect(isAllowedScene("scene.woonkamer_ontspannen")).toBe(true); // favorite
    expect(isAllowedScene("scene.woonkamer_vlammen")).toBe(true);    // non-favorite, in the modal
    expect(isAllowedScene("woonkamer_uit")).toBe(true);
    expect(isAllowedScene("scene.bedroom_secret")).toBe(false);
  });

  it("allSceneList has all 23 woonkamer scenes and a non-favorite maps to scene.turn_on", () => {
    expect(allSceneList()).toHaveLength(23);
    expect(sceneService("scene.woonkamer_vlammen")).toEqual({
      domain: "scene", service: "turn_on", data: { entity_id: "scene.woonkamer_vlammen" },
    });
  });

  it("chill allows all four actions", () => {
    expect(findClimateDevice("climate.zolder")?.actions).toEqual(
      ["on_off", "set_mode", "set_fan", "set_temp"],
    );
  });

  it("sceneList returns SceneRef objects (no service leaked to the client)", () => {
    expect(sceneList()[0]).toEqual({ id: HUE_SCENES[0].id, name: "Pumpkin Spice" });
  });

  it("sceneService maps scene ids to HA services and rejects unknown ids", () => {
    expect(sceneService("scene.woonkamer_ontspannen")).toEqual({
      domain: "scene", service: "turn_on", data: { entity_id: "scene.woonkamer_ontspannen" },
    });
    expect(sceneService("woonkamer_uit")).toEqual({
      domain: "light", service: "turn_off", data: { entity_id: "light.woonkamer" },
    });
    expect(sceneService("scene.bedroom_secret")).toBeUndefined();
  });
});
