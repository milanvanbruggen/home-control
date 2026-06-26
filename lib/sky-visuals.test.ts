import { describe, it, expect } from "vitest";
import { resolveSkyVisual } from "@/lib/sky-visuals";

describe("resolveSkyVisual", () => {
  it("returns a sun scene for sunny + day", () => {
    const v = resolveSkyVisual("sunny", true);
    expect(v.key).toBe("sunny-day");
    expect(v.layers).toEqual(["sun"]);
    expect(v.icon).toBe("sun");
    expect(v.gradient).toContain("linear-gradient");
  });

  it("turns a clear sky into a night scene with moon + stars", () => {
    const v = resolveSkyVisual("sunny", false);
    expect(v.key).toBe("sunny-night");
    expect(v.layers).toEqual(["moon", "stars"]);
    expect(v.icon).toBe("moon");
  });

  it("includes a rain layer for rain, day and night", () => {
    expect(resolveSkyVisual("rain", true).layers).toContain("rain");
    expect(resolveSkyVisual("rain", false).layers).toContain("rain");
  });

  it("falls back to a neutral scene with no layers for unknown", () => {
    const v = resolveSkyVisual("unknown", true);
    expect(v.key).toBe("unknown-day");
    expect(v.layers).toEqual([]);
  });

  it("differentiates rain / pouring / thunder", () => {
    expect(resolveSkyVisual("pouring", true).layers).toContain("downpour");
    expect(resolveSkyVisual("thunder", true).layers).toContain("lightning");
    expect(resolveSkyVisual("thunder", true).layers).toContain("rain");
  });

  describe("cloud-coverage refinement (dry skies)", () => {
    it("renders low-coverage partly-cloudy as a clear sun scene (the 25% case)", () => {
      const v = resolveSkyVisual("partly-cloudy", true, 25);
      expect(v.key).toBe("sunny-day");
      expect(v.layers).toEqual(["sun"]);
      expect(v.icon).toBe("sun");
    });

    it("downgrades a low-coverage 'cloudy' label to sunny", () => {
      expect(resolveSkyVisual("cloudy", true, 20).layers).toEqual(["sun"]);
    });

    it("upgrades a high-coverage 'sunny' label to cloudy", () => {
      const v = resolveSkyVisual("sunny", true, 80);
      expect(v.layers).toEqual(["clouds"]);
      expect(v.icon).toBe("cloud");
    });

    it("keeps mid-coverage as partly-cloudy (sun + clouds)", () => {
      expect(resolveSkyVisual("partly-cloudy", true, 55).layers).toEqual(["sun", "clouds"]);
    });

    it("uses thresholds at 40 (→partly) and 70 (→cloudy)", () => {
      expect(resolveSkyVisual("sunny", true, 40).key).toBe("partly-cloudy-day");
      expect(resolveSkyVisual("sunny", true, 70).key).toBe("cloudy-day");
    });

    it("falls back to the raw condition when coverage is null", () => {
      expect(resolveSkyVisual("partly-cloudy", true, null).layers).toEqual(["sun", "clouds"]);
      expect(resolveSkyVisual("partly-cloudy", true).layers).toEqual(["sun", "clouds"]);
    });

    it("never strips precipitation/fog based on coverage", () => {
      expect(resolveSkyVisual("rain", true, 5).layers).toContain("rain");
      expect(resolveSkyVisual("snow", true, 0).layers).toContain("snow");
      expect(resolveSkyVisual("fog", true, 10).layers).toContain("clouds");
    });

    it("applies coverage refinement at night too", () => {
      const v = resolveSkyVisual("partly-cloudy", false, 25);
      expect(v.key).toBe("sunny-night");
      expect(v.layers).toEqual(["moon", "stars"]);
    });
  });
});
