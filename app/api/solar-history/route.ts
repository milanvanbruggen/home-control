import { getHistory, statusForError } from "@/lib/ha-client";
import { getStatistics } from "@/lib/ha-stats";
import { sumChange, barPoints } from "@/lib/stats-energy";
import { SOLAR, GRID_METER } from "@/config/devices";
import { parseHistory, downsamplePower, dayBoundaries, monthBoundaries } from "@/lib/solar-history";
import { computeTariffCost } from "@/lib/solar-cost";
import { getSettings } from "@/lib/settings-store";
import type { SolarRange, SolarHistoryResponse, ElectricityTariff } from "@/lib/types";

export const dynamic = "force-dynamic";

const RANGES = ["today", "week", "month", "year"] as const;
const DAY_MS = 86_400_000;
const STAT_IDS = [GRID_METER.importT1, GRID_METER.importT2, GRID_METER.exportT1, GRID_METER.exportT2, SOLAR.lifetimeEnergy];

function tariffActive(t: ElectricityTariff): boolean {
  return t.mode === "advanced"
    ? t.importLow != null || t.importHigh != null || t.feedInPrice != null || t.fixedFeedInPerDay != null
    : t.importPrice != null || t.exportPrice != null;
}
function rangeStart(r: SolarRange, now: number): number {
  if (r === "today") return dayBoundaries(now, 1)[0];
  if (r === "week") return dayBoundaries(now, 7)[0];
  if (r === "month") return dayBoundaries(now, 30)[0];
  return monthBoundaries(now, 12)[0];
}
function statPeriod(r: SolarRange): "hour" | "day" | "month" {
  if (r === "today") return "hour";
  if (r === "year") return "month";
  return "day";
}
function costFromStats(stats: Record<string, import("@/lib/ha-stats").StatPoint[]>, tariff: ElectricityTariff, days: number): SolarHistoryResponse["summary"]["cost"] {
  if (!tariffActive(tariff)) return null;
  return computeTariffCost({
    afnameLow: sumChange(stats[GRID_METER.importT1]),
    afnameHigh: sumChange(stats[GRID_METER.importT2]),
    terugLow: sumChange(stats[GRID_METER.exportT1]),
    terugHigh: sumChange(stats[GRID_METER.exportT2]),
  }, tariff, days);
}

export async function GET(req: Request): Promise<Response> {
  const range = new URL(req.url).searchParams.get("range") ?? "";
  if (!(RANGES as readonly string[]).includes(range)) {
    return Response.json({ error: "bad_request" }, { status: 400 });
  }
  const r = range as SolarRange;
  const now = Date.now();
  const start = rangeStart(r, now);
  const iso = (ms: number) => new Date(ms).toISOString();
  const tariff = getSettings().tariff;

  // Statistics power the totals (cost + production). A failure degrades to cost:null + empty bars.
  let stats: Record<string, import("@/lib/ha-stats").StatPoint[]> | null = null;
  try {
    stats = await getStatistics(STAT_IDS, iso(start), iso(now), statPeriod(r));
  } catch {
    stats = null;
  }
  const days = (now - start) / DAY_MS;
  const cost = stats ? costFromStats(stats, tariff, days) : null;
  const producedKwh = stats ? sumChange(stats[SOLAR.lifetimeEnergy], 0.001) : null;

  try {
    if (r === "today") {
      const powerRaw = await getHistory(SOLAR.currentPower, iso(start), iso(now));
      const points = downsamplePower(parseHistory(powerRaw), start, now, 48);
      const body: SolarHistoryResponse = { range: r, chartType: "power", unit: "W", points, summary: { producedKwh, cost } };
      return Response.json(body);
    }
    const points = stats ? barPoints(stats[SOLAR.lifetimeEnergy], 0.001) : [];
    const body: SolarHistoryResponse = { range: r, chartType: "energy", unit: "kWh", points, summary: { producedKwh, cost } };
    return Response.json(body);
  } catch (e) {
    const empty: SolarHistoryResponse = {
      range: r, chartType: r === "today" ? "power" : "energy", unit: r === "today" ? "W" : "kWh",
      points: [], summary: { producedKwh: null, cost: null },
    };
    return Response.json(empty, { status: statusForError(e) });
  }
}
