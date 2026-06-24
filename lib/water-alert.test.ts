import { describe, it, expect } from "vitest";
import { waterAlertNotify, waterTestNotify } from "@/lib/water-alert";

describe("water-alert payloads", () => {
  it("builds a localized alert naming the room with the alarm sound", () => {
    expect(waterAlertNotify("Zolder", "nl").message).toBe("Zolder: waterreservoir legen");
    expect(waterAlertNotify("Zolder", "en").message).toBe("Zolder: empty the water reservoir");
    const { data } = waterAlertNotify("Zolder", "nl");
    expect(data).toMatchObject({ priority: "critical", icon_type: "alert", cycles: 0, sound: "alarm13" });
    expect(typeof data.icon).toBe("string");
  });

  it("builds a gentler test payload", () => {
    const p = waterTestNotify("nl");
    expect(typeof p.message).toBe("string");
    expect(p.data).toMatchObject({ priority: "warning", cycles: 2, sound: "alarm13" });
  });
});
