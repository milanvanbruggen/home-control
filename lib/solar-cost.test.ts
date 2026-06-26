import { describe, it, expect } from "vitest";
import { tariffCost } from "@/lib/solar-cost";

const baseTariff = { mode: "simple" as const, importLow: null, importHigh: null, feedInPrice: null, fixedFeedInPerDay: null };

describe("tariffCost", () => {
  it("multiplies kWh by price, rounded to cents", () => {
    expect(tariffCost(17.8, 22.5, { ...baseTariff, importPrice: 0.23, exportPrice: 0.08 })).toEqual({
      importCost: 4.09, exportEarnings: 1.8,
    });
  });
  it("returns null for a side whose price is null", () => {
    expect(tariffCost(10, 10, { ...baseTariff, importPrice: 0.23, exportPrice: null })).toEqual({
      importCost: 2.3, exportEarnings: null,
    });
  });
  it("returns null for a side whose kWh is null", () => {
    expect(tariffCost(null, 5, { ...baseTariff, importPrice: 0.23, exportPrice: 0.08 })).toEqual({
      importCost: null, exportEarnings: 0.4,
    });
  });
});
