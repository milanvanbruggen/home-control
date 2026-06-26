import type { ElectricityTariff } from "@/lib/types";

export interface PeriodEnergy {
  afnameLow: number | null;
  afnameHigh: number | null;
  terugLow: number | null;
  terugHigh: number | null;
}
export interface CostResult {
  importKwh: number | null;
  exportKwh: number | null;
  importCost: number | null;
  exportEarnings: number | null;
}

const r2 = (x: number) => Math.round(x * 100) / 100;

/** Kosten (afname) en opbrengst (teruglevering) over een termijn, per modus.
 *  Energiehoeveelheden zijn in kWh; bedragen in euro, afgerond op centen. */
export function computeTariffCost(e: PeriodEnergy, t: ElectricityTariff, days: number): CostResult {
  const importKwh = e.afnameLow != null && e.afnameHigh != null ? r2(e.afnameLow + e.afnameHigh) : null;
  const exportKwh = e.terugLow != null && e.terugHigh != null ? r2(e.terugLow + e.terugHigh) : null;

  let importCost: number | null = null;
  let exportEarnings: number | null = null;

  if (t.mode === "advanced") {
    if (e.afnameLow != null && e.afnameHigh != null && t.importLow != null && t.importHigh != null) {
      importCost = r2(e.afnameLow * t.importLow + e.afnameHigh * t.importHigh);
    }
    if (
      e.afnameLow != null && e.afnameHigh != null &&
      e.terugLow != null && e.terugHigh != null &&
      t.importLow != null && t.importHigh != null
    ) {
      const feed = t.feedInPrice ?? 0;
      const fixed = t.fixedFeedInPerDay ?? 0;
      const settledLow = Math.min(e.terugLow, e.afnameLow) * t.importLow;
      const settledHigh = Math.min(e.terugHigh, e.afnameHigh) * t.importHigh;
      const surplusLow = Math.max(0, e.terugLow - e.afnameLow) * feed;
      const surplusHigh = Math.max(0, e.terugHigh - e.afnameHigh) * feed;
      exportEarnings = r2(settledLow + settledHigh + surplusLow + surplusHigh - days * fixed);
    }
  } else {
    if (importKwh != null && t.importPrice != null) importCost = r2(importKwh * t.importPrice);
    if (exportKwh != null && t.exportPrice != null) exportEarnings = r2(exportKwh * t.exportPrice);
  }

  return { importKwh, exportKwh, importCost, exportEarnings };
}
