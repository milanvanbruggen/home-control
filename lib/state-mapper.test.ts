import { describe, it, expect } from "vitest";
import { mapHaStatesToAppState, findClimateRuntime } from "@/lib/state-mapper";
import type { HaEntityState } from "@/lib/types";

const states: HaEntityState[] = [
  {
    entity_id: "climate.zolder", state: "cool",
    attributes: {
      current_temperature: 24.4, temperature: 18, fan_mode: "Hoog",
      fan_modes: ["Laag", "Normaal", "Hoog"], min_temp: 16, max_temp: 30, target_temp_step: 1,
    },
  },
  {
    entity_id: "climate.speelkamer", state: "off",
    attributes: {
      current_temperature: 21, temperature: 20, fan_mode: "Laag",
      fan_modes: ["Laag", "Normaal", "Hoog"], min_temp: 16, max_temp: 30, target_temp_step: 1,
    },
  },
  { entity_id: "sensor.zolder_status", state: "On working", attributes: {} },
  { entity_id: "sensor.speelkamer_status", state: "On starting", attributes: {} },
  { entity_id: "sensor.thermostat_room_temperature", state: "19.6", attributes: {} },
  { entity_id: "sensor.thermostat_room_setpoint", state: "20", attributes: {} },
  { entity_id: "binary_sensor.thermostat_heating", state: "on", attributes: {} },
  { entity_id: "binary_sensor.thermostat_cooling", state: "off", attributes: {} },
  { entity_id: "light.woonkamer", state: "on", attributes: { brightness: 102 } },
  { entity_id: "light.irrelevant", state: "on", attributes: {} },
];

describe("mapHaStatesToAppState", () => {
  it("maps the two chills with bounds and on/off from state", () => {
    const app = mapHaStatesToAppState(states);
    expect(app.chills).toHaveLength(2);
    const zolder = app.chills[0];
    expect(zolder).toMatchObject({
      id: "climate.zolder", name: "Zolder", available: true, on: true,
      mode: "cool", temp: 18, current: 24.4, fan: "Hoog",
      min: 16, max: 30, step: 1, fanOptions: ["Laag", "Normaal", "Hoog"],
      status: "On working",
    });
    expect(app.chills[1]).toMatchObject({ on: false, mode: "off", status: "On starting" });
  });

  it("maps the read-only thermostat from sensors", () => {
    const app = mapHaStatesToAppState(states);
    expect(app.thermostat).toEqual({
      name: "Thermostaat", available: true,
      current: 19.6, setpoint: 20, status: "heating",
    });
  });

  it("includes the configured scene list", () => {
    const app = mapHaStatesToAppState(states);
    expect(app.scenes).toHaveLength(8);
    expect(app.scenes[0].name).toBe("Pumpkin Spice");
  });

  it("maps the woonkamer light group brightness to a percentage", () => {
    const app = mapHaStatesToAppState(states);
    expect(app.lights[0]).toEqual({ id: "light.woonkamer", name: "Woonkamer", on: true, brightness: 40 });
  });

  it("reports brightness 0 / off when the light group is missing", () => {
    const app = mapHaStatesToAppState([]);
    expect(app.lights[0]).toMatchObject({ on: false, brightness: 0 });
  });

  it("marks a missing entity unavailable with safe defaults", () => {
    const app = mapHaStatesToAppState([]);
    expect(app.chills[0]).toMatchObject({ available: false, on: false, mode: "off", temp: null });
    expect(app.thermostat?.available).toBe(false);
  });

  it("treats HA 'unavailable' state as not available", () => {
    const app = mapHaStatesToAppState([
      { entity_id: "climate.zolder", state: "unavailable", attributes: {} },
    ]);
    expect(app.chills[0].available).toBe(false);
  });
});

describe("findClimateRuntime", () => {
  it("finds a chill by id; the thermostat is not climate-controllable", () => {
    const app = mapHaStatesToAppState(states);
    expect(findClimateRuntime(app, "climate.speelkamer")?.id).toBe("climate.speelkamer");
    expect(findClimateRuntime(app, "climate.thermostaat")).toBeUndefined();
    expect(findClimateRuntime(app, "climate.nope")).toBeUndefined();
  });
});
