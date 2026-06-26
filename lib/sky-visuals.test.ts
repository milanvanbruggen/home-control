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
});
