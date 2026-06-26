import { describe, it, expect } from "vitest";
import { computeTariffCost, type PeriodEnergy } from "@/lib/solar-cost";
import type { ElectricityTariff } from "@/lib/types";

const base: ElectricityTariff = {
  mode: "simple", importPrice: null, exportPrice: null,
  importLow: null, importHigh: null, feedInPrice: null, fixedFeedInPerDay: null,
};
const energy = (afnameLow: number | null, afnameHigh: number | null, terugLow: number | null, terugHigh: number | null): PeriodEnergy =>
  ({ afnameLow, afnameHigh, terugLow, terugHigh });

describe("computeTariffCost — simple", () => {
  it("totals kWh and multiplies by the flat prices (kWh-native, not /1000)", () => {
    const t = { ...base, importPrice: 0.25, exportPrice: 0.1 };
    const r = computeTariffCost(energy(30, 14, 2, 3), t, 7);
    expect(r.importKwh).toBe(44);
    expect(r.exportKwh).toBe(5);
    expect(r.importCost).toBe(11);   // 44 * 0.25  (NOT 0.011)
    expect(r.exportEarnings).toBe(0.5);
  });
  it("nulls a side whose price is missing", () => {
    const r = computeTariffCost(energy(30, 14, 2, 3), { ...base, importPrice: 0.25 }, 7);
    expect(r.importCost).toBe(11);
    expect(r.exportEarnings).toBeNull();
  });
});

describe("computeTariffCost — advanced (saldering-aware)", () => {
  const t: ElectricityTariff = { ...base, mode: "advanced", importLow: 0.22216, importHigh: 0.25514, feedInPrice: 0.14, fixedFeedInPerDay: 0.28747 };
  it("imports at dual tariff", () => {
    const r = computeTariffCost(energy(10, 20, 0, 0), t, 1);
    expect(r.importCost).toBe(Math.round((10 * 0.22216 + 20 * 0.25514) * 100) / 100); // 7.32
  });
  it("settles feed-in against consumption at the import price, surplus at feed-in rate, minus fixed/day", () => {
    // low: terug 8 vs afname 5 -> settled 5*0.22216, surplus 3*0.14
    // high: terug 2 vs afname 6 -> settled 2*0.25514, surplus 0
    // minus 1 day * 0.28747
    const r = computeTariffCost(energy(5, 6, 8, 2), t, 1);
    const expected = 5 * 0.22216 + 2 * 0.25514 + 3 * 0.14 + 0 - 1 * 0.28747;
    expect(r.exportEarnings).toBe(Math.round(expected * 100) / 100);
  });
  it("nulls cost when a required advanced price is missing", () => {
    const r = computeTariffCost(energy(5, 6, 8, 2), { ...t, importHigh: null }, 1);
    expect(r.importCost).toBeNull();
    expect(r.exportEarnings).toBeNull();
  });
});

describe("computeTariffCost — totals nulling", () => {
  it("nulls importKwh/exportKwh when a tariff bucket is null", () => {
    const r = computeTariffCost(energy(10, null, 2, 3), { ...base, importPrice: 0.25, exportPrice: 0.1 }, 7);
    expect(r.importKwh).toBeNull();
    expect(r.exportKwh).toBe(5);
  });
});
