import { getHistory, statusForError } from "@/lib/ha-client";
import { SOLAR } from "@/config/devices";
import {
  parseHistory, downsamplePower, energyBuckets, sumKwh, dayBoundaries, monthBoundaries,
} from "@/lib/solar-history";
import type { SolarRange, SolarHistoryResponse } from "@/lib/types";

export const dynamic = "force-dynamic";

const RANGES = ["today", "week", "month", "year"] as const;

function bucketsFor(range: Exclude<SolarRange, "today">, now: number): number[] {
  if (range === "week") return dayBoundaries(now, 7);
  if (range === "month") return dayBoundaries(now, 30);
  return monthBoundaries(now, 12); // year
}

export async function GET(req: Request): Promise<Response> {
  const range = new URL(req.url).searchParams.get("range") ?? "";
  if (!(RANGES as readonly string[]).includes(range)) {
    return Response.json({ error: "bad_request" }, { status: 400 });
  }
  const r = range as SolarRange;
  const now = Date.now();
  const iso = (ms: number) => new Date(ms).toISOString();

  try {
    if (r === "today") {
      const start = dayBoundaries(now, 1)[0];
      const [powerRaw, energyRaw] = await Promise.all([
        getHistory(SOLAR.currentPower, iso(start), iso(now)),
        getHistory(SOLAR.lifetimeEnergy, iso(start), iso(now)),
      ]);
      const points = downsamplePower(parseHistory(powerRaw), start, now, 48);
      const today = energyBuckets(parseHistory(energyRaw), [start, now]);
      const body: SolarHistoryResponse = {
        range: r, chartType: "power", unit: "W", points,
        summary: { producedKwh: today[0]?.value ?? null, cost: null },
      };
      return Response.json(body);
    }

    const boundaries = bucketsFor(r, now);
    const raw = await getHistory(SOLAR.lifetimeEnergy, iso(boundaries[0]), iso(now));
    const points = energyBuckets(parseHistory(raw), boundaries);
    const body: SolarHistoryResponse = {
      range: r, chartType: "energy", unit: "kWh", points,
      summary: { producedKwh: sumKwh(points), cost: null },
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
