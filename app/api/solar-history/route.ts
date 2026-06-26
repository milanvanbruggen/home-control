import { getHistory, statusForError } from "@/lib/ha-client";
import { SOLAR, GRID_METER } from "@/config/devices";
import {
  parseHistory, downsamplePower, energyBuckets, sumKwh, dayBoundaries, monthBoundaries,
} from "@/lib/solar-history";
import { tariffCost } from "@/lib/solar-cost";
import { getSettings } from "@/lib/settings-store";
import type { SolarRange, SolarHistoryResponse, ElectricityTariff } from "@/lib/types";

export const dynamic = "force-dynamic";

const RANGES = ["today", "week", "month", "year"] as const;

function bucketsFor(range: Exclude<SolarRange, "today">, now: number): number[] {
  if (range === "week") return dayBoundaries(now, 7);
  if (range === "month") return dayBoundaries(now, 30);
  return monthBoundaries(now, 12); // year
}

async function computeCost(
  start: number,
  now: number,
  tariff: ElectricityTariff,
  iso: (ms: number) => string,
): Promise<SolarHistoryResponse["summary"]["cost"]> {
  if (tariff.importPrice == null && tariff.exportPrice == null) return null;
  try {
    const [it1, it2, et1, et2] = await Promise.all([
      getHistory(GRID_METER.importT1, iso(start), iso(now)),
      getHistory(GRID_METER.importT2, iso(start), iso(now)),
      getHistory(GRID_METER.exportT1, iso(start), iso(now)),
      getHistory(GRID_METER.exportT2, iso(start), iso(now)),
    ]);
    const delta = (raw: { state: string; last_changed: string }[]) =>
      energyBuckets(parseHistory(raw), [start, now])[0]?.value ?? null;
    const i1 = delta(it1), i2 = delta(it2), e1 = delta(et1), e2 = delta(et2);
    const importKwh = i1 != null && i2 != null ? Math.round((i1 + i2) * 100) / 100 : null;
    const exportKwh = e1 != null && e2 != null ? Math.round((e1 + e2) * 100) / 100 : null;
    const { importCost, exportEarnings } = tariffCost(importKwh, exportKwh, tariff);
    return { importKwh, exportKwh, importCost, exportEarnings };
  } catch {
    return null;
  }
}

export async function GET(req: Request): Promise<Response> {
  const range = new URL(req.url).searchParams.get("range") ?? "";
  if (!(RANGES as readonly string[]).includes(range)) {
    return Response.json({ error: "bad_request" }, { status: 400 });
  }
  const r = range as SolarRange;
  const now = Date.now();
  const iso = (ms: number) => new Date(ms).toISOString();
  const tariff = getSettings().tariff;

  try {
    if (r === "today") {
      const start = dayBoundaries(now, 1)[0];
      const [powerRaw, energyRaw] = await Promise.all([
        getHistory(SOLAR.currentPower, iso(start), iso(now)),
        getHistory(SOLAR.lifetimeEnergy, iso(start), iso(now)),
      ]);
      const points = downsamplePower(parseHistory(powerRaw), start, now, 48);
      const today = energyBuckets(parseHistory(energyRaw), [start, now]);
      const cost = await computeCost(start, now, tariff, iso);
      const body: SolarHistoryResponse = {
        range: r, chartType: "power", unit: "W", points,
        summary: { producedKwh: today[0]?.value ?? null, cost },
      };
      return Response.json(body);
    }

    const boundaries = bucketsFor(r, now);
    const raw = await getHistory(SOLAR.lifetimeEnergy, iso(boundaries[0]), iso(now));
    const points = energyBuckets(parseHistory(raw), boundaries);
    const cost = await computeCost(boundaries[0], now, tariff, iso);
    const body: SolarHistoryResponse = {
      range: r, chartType: "energy", unit: "kWh", points,
      summary: { producedKwh: sumKwh(points), cost },
    };
    return Response.json(body);
  } catch (e) {
    const empty: SolarHistoryResponse = {
      range: r,
      chartType: r === "today" ? "power" : "energy",
      unit: r === "today" ? "W" : "kWh",
      points: [],
      summary: { producedKwh: null, cost: null },
    };
    return Response.json(empty, { status: statusForError(e) });
  }
}
