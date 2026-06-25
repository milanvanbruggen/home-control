import { readHistory } from "@/lib/metrics-history-store";
import { windowAndDownsample, RANGE_MS } from "@/lib/metrics-history";
import { ROOM_METRICS, METRIC_ROOM_KEYS } from "@/config/devices";
import { METRIC_UNIT_FALLBACK } from "@/lib/metrics";

export const dynamic = "force-dynamic";

const RANGES = ["24h", "7d", "30d"] as const;
type Range = (typeof RANGES)[number];

export async function GET(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const room = url.searchParams.get("room") ?? "";
  const range = url.searchParams.get("range") ?? "";
  if (!METRIC_ROOM_KEYS.has(room) || !(RANGES as readonly string[]).includes(range)) {
    return Response.json({ error: "bad_request" }, { status: 400 });
  }
  const cfg = ROOM_METRICS.find((r) => r.key === room)!;
  const now = Date.now();
  const fromMs = now - RANGE_MS[range as Range];
  const maxPoints = range === "24h" ? 48 : 150;
  const samples = readHistory().samples;
  const series = cfg.sensors.map((s) => ({
    kind: s.kind,
    unit: METRIC_UNIT_FALLBACK[s.kind],
    points: windowAndDownsample(samples, `${room}.${s.kind}`, fromMs, now, maxPoints),
  }));
  return Response.json({ room, range, series });
}
