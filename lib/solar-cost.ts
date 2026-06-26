import type { ElectricityTariff } from "@/lib/types";

/** Kosten (afname) en opbrengst (teruglevering) over een termijn; null waar kWh
 *  of prijs ontbreekt. Afgerond op centen. */
export function tariffCost(
  importKwh: number | null,
  exportKwh: number | null,
  tariff: ElectricityTariff,
): { importCost: number | null; exportEarnings: number | null } {
  const importCost =
    importKwh != null && tariff.importPrice != null
      ? Math.round(importKwh * tariff.importPrice * 100) / 100
      : null;
  const exportEarnings =
    exportKwh != null && tariff.exportPrice != null
      ? Math.round(exportKwh * tariff.exportPrice * 100) / 100
      : null;
  return { importCost, exportEarnings };
}
