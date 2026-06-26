import { describe, it, expect } from "vitest";
import { mapHaStatesToAppState, findClimateRuntime } from "@/lib/state-mapper";
import type { HaEntityState, RoomState } from "@/lib/types";

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
  { entity_id: "binary_sensor.zolder_water_tank_warning", state: "on", attributes: {} },
  {
    entity_id: "climate.woonkamer_woonkamer", state: "heat",
    attributes: { current_temperature: 19.6, temperature: 20, hvac_action: "heating", min_temp: 5, max_temp: 25 },
  },
  // light groups
  { entity_id: "light.woonkamer", state: "on", attributes: { brightness: 102 } },
  { entity_id: "light.keuken", state: "off", attributes: {} },
  // scenes (grouped by group_name)
  { entity_id: "scene.woonkamer_pumpkin_spice", state: "x", attributes: { group_type: "room", group_name: "Woonkamer", name: "Pumpkin Spice" } },
  { entity_id: "scene.woonkamer_vlammen", state: "x", attributes: { group_type: "room", group_name: "Woonkamer", name: "Vlammen" } },
  { entity_id: "scene.keuken_helder", state: "x", attributes: { group_type: "room", group_name: "Keuken", name: "Keuken Helder" } },
  // a scene in a NON-allowed room — must be ignored
  { entity_id: "scene.garage_secret", state: "x", attributes: { group_type: "room", group_name: "Garage", name: "Secret" } },
  { entity_id: "light.irrelevant", state: "on", attributes: {} },
  { entity_id: "sensor.woonkamer_woonkamer_temperature", state: "21.4", attributes: { unit_of_measurement: "°C", device_class: "temperature" } },
  { entity_id: "sensor.woonkamer_woonkamer_humidity", state: "48", attributes: { unit_of_measurement: "%", device_class: "humidity" } },
  { entity_id: "sensor.zolder_ambient_temperature", state: "unavailable", attributes: {} },
];

function room(app: { rooms: RoomState[] }, key: string): RoomState {
  const r = app.rooms.find((x) => x.key === key);
  if (!r) throw new Error(`room ${key} missing`);
  return r;
}

describe("mapHaStatesToAppState", () => {
  it("maps the two chills with bounds and on/off from state", () => {
    const app = mapHaStatesToAppState(states);
    expect(app.chills).toHaveLength(2);
    expect(app.chills[0]).toMatchObject({
      id: "climate.zolder", name: "Zolder", available: true, on: true,
      mode: "cool", temp: 18, current: 24.4, fan: "Hoog",
      min: 16, max: 30, step: 1, fanOptions: ["Laag", "Normaal", "Hoog"],
      status: "On working", waterWarning: true, lastMode: "cool",
    });
    expect(app.chills[1]).toMatchObject({ on: false, mode: "off", status: "On starting", waterWarning: false, lastMode: null });
  });

  it("maps the controllable thermostat from the climate entity", () => {
    const app = mapHaStatesToAppState(states);
    expect(app.thermostat).toEqual({
      id: "climate.woonkamer_woonkamer", name: "Thermostaat", available: true,
      current: 19.6, setpoint: 20, min: 5, max: 25, step: 0.5, status: "heating",
    });
  });

  it("reports status 'off' when the thermostat hvac_mode is off", () => {
    const app = mapHaStatesToAppState([
      { entity_id: "climate.woonkamer_woonkamer", state: "off",
        attributes: { current_temperature: 25.3, temperature: 5, hvac_action: "off", min_temp: 5, max_temp: 25 } },
    ]);
    expect(app.thermostat?.status).toBe("off");
    expect(app.thermostat?.current).toBe(25.3);
  });

  it("builds the 7 rooms", () => {
    expect(mapHaStatesToAppState(states).rooms).toHaveLength(7);
  });

  it("groups each room's scenes (favorites first for woonkamer) and ignores non-allowed rooms", () => {
    const app = mapHaStatesToAppState(states);
    const wk = room(app, "woonkamer");
    expect(wk.scenes.map((s) => s.id)).toEqual(["scene.woonkamer_pumpkin_spice", "scene.woonkamer_vlammen"]);
    expect(wk.scenes[0].name).toBe("Pumpkin Spice"); // favorite ordered first
    const keuken = room(app, "keuken");
    expect(keuken.scenes).toEqual([{ id: "scene.keuken_helder", name: "Keuken Helder" }]);
    // the "Garage" scene belongs to no configured room → present in no room
    expect(app.rooms.some((r) => r.scenes.some((s) => s.id === "scene.garage_secret"))).toBe(false);
  });

  it("computes grid favorites from config defaults, filtered to existing scenes", () => {
    const app = mapHaStatesToAppState(states);
    // woonkamer's config favorites list 7 ids, but only pumpkin_spice exists in the fixture
    expect(room(app, "woonkamer").favorites).toEqual(["scene.woonkamer_pumpkin_spice"]);
    // keuken has no config favorites → falls back to its scenes (only helder here)
    expect(room(app, "keuken").favorites).toEqual(["scene.keuken_helder"]);
  });

  it("uses settings-store favorites when given, dropping stale ids; scenes still lists all", () => {
    const app = mapHaStatesToAppState(states, {}, { woonkamer: ["scene.woonkamer_vlammen", "scene.gone"] });
    expect(room(app, "woonkamer").favorites).toEqual(["scene.woonkamer_vlammen"]);
    expect(room(app, "woonkamer").scenes).toHaveLength(2);
  });

  it("attaches the Hue gradient to a scene when room|name matches, else leaves it undefined", () => {
    const grad = "linear-gradient(135deg, #f0913f, #99421b)";
    const app = mapHaStatesToAppState(states, {}, {}, { "woonkamer|pumpkin spice": grad });
    const wk = room(app, "woonkamer");
    expect(wk.scenes.find((s) => s.id === "scene.woonkamer_pumpkin_spice")?.gradient).toBe(grad);
    expect(wk.scenes.find((s) => s.id === "scene.woonkamer_vlammen")?.gradient).toBeUndefined();
  });

  it("maps each room's light group brightness to a percentage", () => {
    const app = mapHaStatesToAppState(states);
    expect(room(app, "woonkamer")).toMatchObject({ lightId: "light.woonkamer", on: true, brightness: 40 });
    expect(room(app, "keuken")).toMatchObject({ on: false, brightness: 0 });
  });

  it("reports brightness 0 / off when a room's light group is missing", () => {
    const app = mapHaStatesToAppState([]);
    expect(room(app, "woonkamer")).toMatchObject({ on: false, brightness: 0, scenes: [] });
  });

  it("reflects the per-room active scene passed in", () => {
    expect(room(mapHaStatesToAppState(states), "woonkamer").activeScene).toBeNull();
    const app = mapHaStatesToAppState(states, { woonkamer: "scene.woonkamer_vlammen" });
    expect(room(app, "woonkamer").activeScene).toBe("scene.woonkamer_vlammen");
    expect(room(app, "keuken").activeScene).toBeNull();
  });

  it("marks a missing chill unavailable with safe defaults", () => {
    const app = mapHaStatesToAppState([]);
    expect(app.chills[0]).toMatchObject({ available: false, on: false, mode: "off", temp: null });
    expect(app.thermostat?.available).toBe(false);
  });

  it("treats HA 'unavailable' chill state as not available", () => {
    const app = mapHaStatesToAppState([
      { entity_id: "climate.zolder", state: "unavailable", attributes: {} },
    ]);
    expect(app.chills[0].available).toBe(false);
  });
});

describe("findClimateRuntime", () => {
  it("finds a chill or the thermostat by id", () => {
    const app = mapHaStatesToAppState(states);
    expect(findClimateRuntime(app, "climate.speelkamer")?.id).toBe("climate.speelkamer");
    expect(findClimateRuntime(app, "climate.woonkamer_woonkamer")?.id).toBe("climate.woonkamer_woonkamer");
    expect(findClimateRuntime(app, "climate.nope")).toBeUndefined();
  });
});

describe("mapSolar (via mapHaStatesToAppState)", () => {
  it("maps live solar values and computes net export", () => {
    const states: HaEntityState[] = [
      { entity_id: "sensor.solaredge_current_power", state: "3240", attributes: {} },
      { entity_id: "sensor.solaredge_lifetime_energy", state: "16185908", attributes: {} },
      { entity_id: "sensor.home_solar_percentage", state: "100", attributes: {} },
      { entity_id: "sensor.electricity_meter_power_consumption", state: "0.2", attributes: {} },
      { entity_id: "sensor.electricity_meter_power_production", state: "2.0", attributes: {} },
    ];
    const app = mapHaStatesToAppState(states);
    expect(app.solar.available).toBe(true);
    expect(app.solar.currentPowerW).toBe(3240);
    expect(app.solar.lifetimeKwh).toBe(16186);
    expect(app.solar.coveragePct).toBe(100);
    expect(app.solar.netGridKw).toBeCloseTo(-1.8, 5);
    expect(app.solar.gridDirection).toBe("export");
  });

  it("is unavailable and idle when solar sensors are missing", () => {
    const app = mapHaStatesToAppState([]);
    expect(app.solar.available).toBe(false);
    expect(app.solar.currentPowerW).toBeNull();
    expect(app.solar.netGridKw).toBeNull();
    expect(app.solar.gridDirection).toBe("idle");
  });

  it("clamps coverage above 100% down to 100", () => {
    const app = mapHaStatesToAppState([
      { entity_id: "sensor.home_solar_percentage", state: "118", attributes: {} },
    ]);
    expect(app.solar.coveragePct).toBe(100);
  });
});

describe("mapHaStatesToAppState metrics", () => {
  function metricsRoom(app: { metrics: { key: string; name: string; metrics: { kind: string; value: number | null; unit: string; visible: boolean }[] }[] }, key: string) {
    const r = app.metrics.find((m) => m.key === key);
    if (!r) throw new Error(`metric room ${key} missing`);
    return r;
  }

  it("maps temperature + humidity values and units from HA state", () => {
    const wk = metricsRoom(mapHaStatesToAppState(states), "woonkamer");
    expect(wk.metrics).toEqual([
      { kind: "temperature", value: 21.4, unit: "°C", visible: true },
      { kind: "humidity", value: 48, unit: "%", visible: true },
    ]);
  });

  it("yields a null value for unavailable/missing sensors but keeps the metric", () => {
    const app = mapHaStatesToAppState(states);
    expect(metricsRoom(app, "zolder").metrics[0]).toEqual({ kind: "temperature", value: null, unit: "°C", visible: true });
    // 'buiten' sensor isn't in the fixture at all → null with the fallback unit
    expect(metricsRoom(app, "buiten").metrics[0]).toMatchObject({ value: null, unit: "°C" });
  });

  it("marks a metric hidden when hiddenMetrics lists its kind for that room", () => {
    const app = mapHaStatesToAppState(states, {}, {}, {}, { woonkamer: ["humidity"] });
    const wk = metricsRoom(app, "woonkamer");
    expect(wk.metrics.find((m) => m.kind === "temperature")?.visible).toBe(true);
    expect(wk.metrics.find((m) => m.kind === "humidity")?.visible).toBe(false);
  });
});
