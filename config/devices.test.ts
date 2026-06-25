import { describe, it, expect } from "vitest";
import {
  CHILLS, THERMOSTAT, ROOMS, ALLOWED_ROOM_GROUP_NAMES,
  findClimateDevice, findRoomByKey, findRoomByGroupName, findRoomByLightGroup,
  isAllowedLight, roomUitId, parseRoomUit,
  ROOM_METRICS, METRIC_KINDS, METRIC_ROOM_KEYS,
} from "@/config/devices";

describe("device config", () => {
  it("has two chills and a controllable thermostat (on/off + set_temp)", () => {
    expect(CHILLS).toHaveLength(2);
    expect(THERMOSTAT.name).toBe("Thermostaat");
    expect(THERMOSTAT.id).toBe("climate.woonkamer_woonkamer");
    expect(THERMOSTAT.kind).toBe("thermostat");
    expect(THERMOSTAT.actions).toEqual(["on_off", "set_temp"]);
  });

  it("finds whitelisted climate devices (chills + thermostat) and rejects others", () => {
    expect(findClimateDevice("climate.zolder")?.kind).toBe("chill");
    expect(findClimateDevice("climate.woonkamer_woonkamer")?.kind).toBe("thermostat");
    expect(findClimateDevice("climate.evil")).toBeUndefined();
  });

  it("chill allows all four actions", () => {
    expect(findClimateDevice("climate.zolder")?.actions).toEqual(
      ["on_off", "set_mode", "set_fan", "set_temp"],
    );
  });

  it("defines 7 rooms incl. woonkamer with 7 favorites", () => {
    expect(ROOMS).toHaveLength(7);
    const wk = findRoomByKey("woonkamer");
    expect(wk?.lightGroup).toBe("light.woonkamer");
    expect(wk?.groupName).toBe("Woonkamer");
    expect(wk?.favorites).toHaveLength(7);
    expect(findRoomByKey("keuken")?.lightGroup).toBe("light.keuken");
    expect(findRoomByKey("nope")).toBeUndefined();
  });

  it("resolves rooms by group name and light group, and gates group names", () => {
    expect(findRoomByGroupName("Slaapkamer Bas")?.key).toBe("slaapkamer_bas");
    expect(findRoomByGroupName("Badkamer")).toBeUndefined();
    expect(findRoomByLightGroup("light.keuken")?.key).toBe("keuken");
    expect(ALLOWED_ROOM_GROUP_NAMES.has("Werkkamer")).toBe(true);
    expect(ALLOWED_ROOM_GROUP_NAMES.has("Garage")).toBe(false);
  });

  it("allows the 7 room light groups + the whole-house 'all' target", () => {
    expect(isAllowedLight("light.woonkamer")).toBe(true);
    expect(isAllowedLight("light.keuken")).toBe(true);
    expect(isAllowedLight("light.slaapkamer_2")).toBe(true);
    expect(isAllowedLight("all")).toBe(true);
    expect(isAllowedLight("light.badkamer")).toBe(false);
  });

  it("parses per-room Uit sentinels", () => {
    expect(roomUitId("keuken")).toBe("keuken_uit");
    expect(parseRoomUit("keuken_uit")?.key).toBe("keuken");
    expect(parseRoomUit("woonkamer_uit")?.lightGroup).toBe("light.woonkamer");
    expect(parseRoomUit("scene.woonkamer_lezen")).toBeUndefined();
    expect(parseRoomUit("nope_uit")).toBeUndefined();
  });
});

describe("room metrics config", () => {
  it("defines metric kinds temperature + humidity", () => {
    expect(METRIC_KINDS).toEqual(["temperature", "humidity"]);
  });

  it("has unique room keys, each with sensor.* entities of known kinds", () => {
    const keys = ROOM_METRICS.map((r) => r.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const room of ROOM_METRICS) {
      expect(room.name.length).toBeGreaterThan(0);
      expect(room.sensors.length).toBeGreaterThan(0);
      for (const s of room.sensors) {
        expect(s.entityId.startsWith("sensor.")).toBe(true);
        expect(METRIC_KINDS).toContain(s.kind);
      }
    }
  });

  it("includes woonkamer (temp+humidity) and an outdoor temperature room", () => {
    const wk = ROOM_METRICS.find((r) => r.key === "woonkamer");
    expect(wk?.sensors.map((s) => s.kind)).toEqual(["temperature", "humidity"]);
    const buiten = ROOM_METRICS.find((r) => r.key === "buiten");
    expect(buiten?.sensors[0].entityId).toBe("sensor.home_outdoor_temperature");
  });

  it("exposes the room keys as a set", () => {
    expect(METRIC_ROOM_KEYS.has("woonkamer")).toBe(true);
    expect(METRIC_ROOM_KEYS.has("nope")).toBe(false);
  });
});
