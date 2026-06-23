import { describe, it, expect } from "vitest";
import { mapHaStatesToAppState, findClimateRuntime } from "@/lib/state-mapper";
import type { HaEntityState } from "@/lib/types";

const states: HaEntityState[] = [
  {
    entity_id: "climate.zolder_chill", state: "cool",
    attributes: {
      current_temperature: 24.4, temperature: 18, fan_mode: "Hoog",
      fan_modes: ["Laag", "Normaal", "Hoog"], min_temp: 16, max_temp: 30, target_temp_step: 1,
    },
  },
  {
    entity_id: "climate.speelkamer_chill", state: "off",
    attributes: {
      current_temperature: 21, temperature: 20, fan_mode: "Laag",
      fan_modes: ["Laag", "Normaal", "Hoog"], min_temp: 16, max_temp: 30, target_temp_step: 1,
    },
  },
  {
    entity_id: "climate.thermostaat", state: "heat",
    attributes: { current_temperature: 19.6, temperature: 20, min_temp: 5, max_temp: 30, target_temp_step: 0.5 },
  },
  { entity_id: "light.irrelevant", state: "on", attributes: {} },
];

describe("mapHaStatesToAppState", () => {
  it("maps the two chills with bounds and on/off from state", () => {
    const app = mapHaStatesToAppState(states);
    expect(app.chills).toHaveLength(2);
    const zolder = app.chills[0];
    expect(zolder).toMatchObject({
      id: "climate.zolder_chill", name: "Zolder", available: true, on: true,
      mode: "cool", temp: 18, current: 24.4, fan: "Hoog",
      min: 16, max: 30, step: 1, fanOptions: ["Laag", "Normaal", "Hoog"],
    });
    expect(app.chills[1]).toMatchObject({ on: false, mode: "off" });
  });

  it("maps the thermostat", () => {
    const app = mapHaStatesToAppState(states);
    expect(app.thermostat).toMatchObject({
      id: "climate.thermostaat", name: "Thermostaat", available: true,
      temp: 20, current: 19.6, min: 5, max: 30, step: 0.5,
    });
  });

  it("includes the configured scene list", () => {
    const app = mapHaStatesToAppState(states);
    expect(app.scenes).toHaveLength(8);
    expect(app.scenes[0].name).toBe("Pumpkin Spice");
  });

  it("marks a missing entity unavailable with safe defaults", () => {
    const app = mapHaStatesToAppState([]);
    expect(app.chills[0]).toMatchObject({ available: false, on: false, mode: "off", temp: null });
    expect(app.thermostat?.available).toBe(false);
  });

  it("treats HA 'unavailable' state as not available", () => {
    const app = mapHaStatesToAppState([
      { entity_id: "climate.zolder_chill", state: "unavailable", attributes: {} },
    ]);
    expect(app.chills[0].available).toBe(false);
  });
});

describe("findClimateRuntime", () => {
  it("finds a chill and the thermostat by id", () => {
    const app = mapHaStatesToAppState(states);
    expect(findClimateRuntime(app, "climate.speelkamer_chill")?.id).toBe("climate.speelkamer_chill");
    expect(findClimateRuntime(app, "climate.thermostaat")?.id).toBe("climate.thermostaat");
    expect(findClimateRuntime(app, "climate.nope")).toBeUndefined();
  });
});
