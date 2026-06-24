import { describe, it, expect } from "vitest";
import {
  CHILLS, THERMOSTAT, ROOMS, ALLOWED_ROOM_GROUP_NAMES,
  findClimateDevice, findRoomByKey, findRoomByGroupName, findRoomByLightGroup,
  isAllowedLight, roomUitId, parseRoomUit,
} from "@/config/devices";

describe("device config", () => {
  it("has two chills and a controllable thermostat (set_temp only)", () => {
    expect(CHILLS).toHaveLength(2);
    expect(THERMOSTAT.name).toBe("Thermostaat");
    expect(THERMOSTAT.id).toBe("climate.woonkamer_woonkamer");
    expect(THERMOSTAT.kind).toBe("thermostat");
    expect(THERMOSTAT.actions).toEqual(["set_temp"]);
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
