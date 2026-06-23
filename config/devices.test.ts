import { describe, it, expect } from "vitest";
import {
  CHILLS, THERMOSTAT, HUE_SCENES,
  findClimateDevice, isAllowedScene, sceneList,
} from "@/config/devices";

describe("device allowlist", () => {
  it("has two chills and a thermostat", () => {
    expect(CHILLS).toHaveLength(2);
    expect(THERMOSTAT.kind).toBe("thermostat");
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
    expect(findClimateDevice("climate.zolder_chill")?.kind).toBe("chill");
    expect(findClimateDevice("climate.thermostaat")?.kind).toBe("thermostat");
    expect(findClimateDevice("climate.evil")).toBeUndefined();
  });

  it("allows only the configured scenes", () => {
    expect(isAllowedScene("scene.woonkamer_ontspannen")).toBe(true);
    expect(isAllowedScene("scene.bedroom_secret")).toBe(false);
  });

  it("chill allows all four actions; thermostat only set_temp", () => {
    expect(findClimateDevice("climate.zolder_chill")?.actions).toEqual(
      ["on_off", "set_mode", "set_fan", "set_temp"],
    );
    expect(THERMOSTAT.actions).toEqual(["set_temp"]);
  });

  it("sceneList returns SceneRef objects", () => {
    expect(sceneList()[0]).toEqual({ id: HUE_SCENES[0].id, name: "Pumpkin Spice" });
  });
});
