import { describe, it, expect } from "vitest";
import { t } from "@/lib/i18n";

describe("t (i18n)", () => {
  it("returns the English source string", () => {
    expect(t("en", "lights.allScenes")).toBe("All scenes");
    expect(t("en", "common.off")).toBe("Off");
  });

  it("returns the Dutch translation", () => {
    expect(t("nl", "lights.allScenes")).toBe("Alle scenes");
    expect(t("nl", "common.off")).toBe("Uit");
  });

  it("interpolates {params} in both languages", () => {
    expect(t("en", "lights.switchRoom", { room: "Kitchen" })).toBe("Switch room (now Kitchen)");
    expect(t("nl", "lights.allScenesTitle", { room: "Keuken" })).toBe("Alle scenes — Keuken");
  });

  it("falls back to the key itself when the key is unknown", () => {
    // @ts-expect-error — exercising the runtime fallback for an unknown key
    expect(t("en", "does.not.exist")).toBe("does.not.exist");
  });
});
