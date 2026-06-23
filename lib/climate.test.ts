import { describe, it, expect } from "vitest";
import { validateClimateValue, climateActionToService } from "@/lib/climate";
import type { ChillState, ThermostatState } from "@/lib/types";

const chill: ChillState = {
  id: "climate.zolder_chill", name: "Zolder", available: true, on: true,
  mode: "cool", temp: 18, current: 24.4, fan: "Hoog",
  min: 16, max: 30, step: 1, fanOptions: ["Laag", "Normaal", "Hoog"],
};

describe("validateClimateValue", () => {
  it("accepts a temp within bounds", () => {
    expect(validateClimateValue("set_temp", 20, chill)).toEqual({ ok: true, value: 20 });
  });
  it("rejects a temp above max", () => {
    expect(validateClimateValue("set_temp", 99, chill)).toEqual({ ok: false, error: "temp_out_of_range" });
  });
  it("rejects a non-numeric temp", () => {
    expect(validateClimateValue("set_temp", "warm", chill)).toEqual({ ok: false, error: "temp_out_of_range" });
  });
  it("accepts a valid mode and rejects others", () => {
    expect(validateClimateValue("set_mode", "heat", chill)).toEqual({ ok: true, value: "heat" });
    expect(validateClimateValue("set_mode", "auto", chill)).toEqual({ ok: false, error: "bad_mode" });
  });
  it("accepts a fan in fanOptions and rejects others", () => {
    expect(validateClimateValue("set_fan", "Laag", chill)).toEqual({ ok: true, value: "Laag" });
    expect(validateClimateValue("set_fan", "Turbo", chill)).toEqual({ ok: false, error: "bad_fan" });
  });
  it("accepts a boolean on_off and rejects non-boolean", () => {
    expect(validateClimateValue("on_off", false, chill)).toEqual({ ok: true, value: false });
    expect(validateClimateValue("on_off", "yes", chill)).toEqual({ ok: false, error: "bad_on_off" });
  });
  it("rejects set_fan for a thermostat (no fanOptions)", () => {
    const thermostat: ThermostatState = {
      id: "climate.thermostaat", name: "Thermostaat", available: true,
      temp: 20, current: 19.6, min: 5, max: 30, step: 0.5,
    };
    expect(validateClimateValue("set_fan", "Laag", thermostat)).toEqual({ ok: false, error: "bad_fan" });
  });
  it("rejects Infinity and -Infinity for set_temp", () => {
    expect(validateClimateValue("set_temp", Infinity, chill)).toEqual({ ok: false, error: "temp_out_of_range" });
    expect(validateClimateValue("set_temp", -Infinity, chill)).toEqual({ ok: false, error: "temp_out_of_range" });
  });
});

describe("climateActionToService", () => {
  it("maps set_temp to set_temperature", () => {
    expect(climateActionToService(chill.id, "set_temp", 20, chill)).toEqual({
      domain: "climate", service: "set_temperature",
      data: { entity_id: chill.id, temperature: 20 },
    });
  });
  it("maps set_mode to set_hvac_mode", () => {
    expect(climateActionToService(chill.id, "set_mode", "heat", chill)).toEqual({
      domain: "climate", service: "set_hvac_mode",
      data: { entity_id: chill.id, hvac_mode: "heat" },
    });
  });
  it("maps set_fan to set_fan_mode", () => {
    expect(climateActionToService(chill.id, "set_fan", "Laag", chill)).toEqual({
      domain: "climate", service: "set_fan_mode",
      data: { entity_id: chill.id, fan_mode: "Laag" },
    });
  });
  it("maps on_off=false to set_hvac_mode off", () => {
    expect(climateActionToService(chill.id, "on_off", false, chill)).toEqual({
      domain: "climate", service: "set_hvac_mode",
      data: { entity_id: chill.id, hvac_mode: "off" },
    });
  });
  it("maps on_off=true to the current mode", () => {
    expect(climateActionToService(chill.id, "on_off", true, chill).data).toEqual({
      entity_id: chill.id, hvac_mode: "cool",
    });
  });
  it("maps on_off=true to cool when currently off", () => {
    const offChill = { ...chill, mode: "off" as const, on: false };
    expect(climateActionToService(chill.id, "on_off", true, offChill).data).toEqual({
      entity_id: chill.id, hvac_mode: "cool",
    });
  });
});
