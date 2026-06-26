import { describe, it, expect } from "vitest";
import { sumChange, barPoints } from "@/lib/stats-energy";
import type { StatPoint } from "@/lib/ha-stats";

const pts = (xs: Array<[number, number | null]>): StatPoint[] => xs.map(([t, c]) => ({ start: t, end: t + 1, change: c }));

describe("sumChange", () => {
  it("sums change at scale 1 (meters, kWh)", () => {
    expect(sumChange(pts([[1, 0.282], [2, 0.5]]))).toBe(0.782);
  });
  it("applies the Wh→kWh scale (0.001) for the solar sensor", () => {
    expect(sumChange(pts([[1, 1600], [2, 1400]]), 0.001)).toBe(3);
  });
  it("treats zero change as a real value (sparse feed-in)", () => {
    expect(sumChange(pts([[1, 0], [2, 0]]))).toBe(0);
  });
  it("returns null for missing or empty input", () => {
    expect(sumChange(undefined)).toBeNull();
    expect(sumChange([])).toBeNull();
  });
});

describe("barPoints", () => {
  it("maps change points to {t,value} bars with scale", () => {
    expect(barPoints(pts([[100, 5000], [200, 3000]]), 0.001)).toEqual([
      { t: 100, value: 5 }, { t: 200, value: 3 },
    ]);
  });
  it("passes null change through as null", () => {
    expect(barPoints(pts([[100, null]]))).toEqual([{ t: 100, value: null }]);
  });
  it("returns [] for missing input", () => {
    expect(barPoints(undefined)).toEqual([]);
  });
});
