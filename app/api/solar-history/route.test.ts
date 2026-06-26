import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@/lib/ha-client", () => ({
  getHistory: vi.fn(),
  statusForError: () => 502,
}));
vi.mock("@/lib/settings-store", () => ({ getSettings: vi.fn() }));
vi.mock("@/lib/ha-stats", () => ({ getStatistics: vi.fn() }));
import { getHistory } from "@/lib/ha-client";
import { getSettings } from "@/lib/settings-store";
import { getStatistics } from "@/lib/ha-stats";
import { GET } from "@/app/api/solar-history/route";

const mockHistory = getHistory as unknown as ReturnType<typeof vi.fn>;
const mockSettings = getSettings as unknown as ReturnType<typeof vi.fn>;
const mockStats = getStatistics as unknown as ReturnType<typeof vi.fn>;

function req(range: string) {
  return new Request(`http://localhost/api/solar-history?range=${range}`);
}

// Pin the clock to the day the fixtures below describe (2026-06-25). The route
// derives its "today" window from Date.now(), so without a fixed clock these
// assertions silently break once the real date rolls past 2026-06-25.
beforeEach(async () => {
  vi.setSystemTime(new Date("2026-06-25T12:00:00Z"));
  // Vitest 4.1.9 spy quirk: the *first* promise-returning call of a freshly
  // mockReset() mock misfires its settled-result tracking, surfacing an awaited
  // -and-caught rejection as a false "unhandled rejection" that fails the test.
  // Priming the mock once with a resolved promise initialises that tracking.
  mockHistory.mockReset();
  mockHistory.mockResolvedValueOnce(undefined);
  await (mockHistory as unknown as () => Promise<unknown>)();
  mockHistory.mockReset();
  mockStats.mockReset();
  mockHistory.mockResolvedValue([]); // today power curve (getHistory)
  mockStats.mockResolvedValue({});   // overridden per test
  mockSettings.mockReturnValue({ tariff: { mode: "simple", importPrice: null, exportPrice: null, importLow: null, importHigh: null, feedInPrice: null, fixedFeedInPerDay: null } });
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("GET /api/solar-history", () => {
  it("rejects an unknown range with 400", async () => {
    const res = await GET(req("decade"));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "bad_request" });
  });

  it("returns a power curve + producedKwh for range=today", async () => {
    mockHistory.mockResolvedValueOnce([ // current_power
      { state: "1000", last_changed: "2026-06-25T09:00:00Z" },
      { state: "2000", last_changed: "2026-06-25T10:00:00Z" },
    ]);
    mockStats.mockResolvedValue({
      "sensor.solaredge_lifetime_energy": [{ start: 1, end: 2, change: 5000 }], // 5000 Wh -> 5 kWh
    });
    const res = await GET(req("today"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.range).toBe("today");
    expect(body.chartType).toBe("power");
    expect(body.unit).toBe("W");
    expect(Array.isArray(body.points)).toBe(true);
    expect(body.summary.producedKwh).toBe(5);
  });

  it("returns energy bars for range=week", async () => {
    mockHistory.mockResolvedValueOnce([
      { state: "0", last_changed: "2026-06-18T00:00:00Z" },
      { state: "7000", last_changed: "2026-06-25T00:00:00Z" }, // 7 kWh total over window
    ]);
    const res = await GET(req("week"));
    const body = await res.json();
    expect(body.chartType).toBe("energy");
    expect(body.unit).toBe("kWh");
    expect(Array.isArray(body.points)).toBe(true);
  });

  it("returns an empty payload (not a throw) when HA fails", async () => {
    mockHistory.mockRejectedValue(new Error("boom"));
    const res = await GET(req("today"));
    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.points).toEqual([]);
    expect(body.summary.producedKwh).toBeNull();
  });

  it("omits cost (null) when no usable tariff is set", async () => {
    const body = await (await GET(req("week"))).json();
    expect(body.summary.cost).toBeNull();
  });

  it("computes month cost from statistics change (no longer null)", async () => {
    mockSettings.mockReturnValue({ tariff: { mode: "simple", importPrice: 0.25, exportPrice: 0.1, importLow: null, importHigh: null, feedInPrice: null, fixedFeedInPerDay: null } });
    mockStats.mockResolvedValue({
      "sensor.electricity_meter_energy_consumption_tarif_1": [{ start: 1, end: 2, change: 30 }],
      "sensor.electricity_meter_energy_consumption_tarif_2": [{ start: 1, end: 2, change: 14 }], // import 44
      "sensor.electricity_meter_energy_production_tarif_1": [{ start: 1, end: 2, change: 0 }],    // sparse dal -> 0, not null
      "sensor.electricity_meter_energy_production_tarif_2": [{ start: 1, end: 2, change: 5 }],
      "sensor.solaredge_lifetime_energy": [{ start: 1, end: 2, change: 50000 }],
    });
    const body = await (await GET(req("month"))).json();
    expect(body.summary.cost.importKwh).toBe(44);
    expect(body.summary.cost.importCost).toBe(11);   // realistic, not null
    expect(body.summary.cost.exportKwh).toBe(5);      // 0 + 5, dal counted as 0 not null
    expect(body.summary.producedKwh).toBe(50);        // 50000 Wh -> 50 kWh
    expect(body.points.length).toBe(1);               // bars from solar change
  });

  it("returns cost null and empty bars when statistics fail, without throwing", async () => {
    mockSettings.mockReturnValue({ tariff: { mode: "simple", importPrice: 0.25, exportPrice: 0.1, importLow: null, importHigh: null, feedInPrice: null, fixedFeedInPerDay: null } });
    mockStats.mockRejectedValue(new Error("ws down"));
    const res = await GET(req("week"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.summary.cost).toBeNull();
    expect(body.points).toEqual([]);
  });

  it("uses period hour for today and keeps the live power curve", async () => {
    mockStats.mockResolvedValue({ "sensor.solaredge_lifetime_energy": [{ start: 1, end: 2, change: 1400 }] });
    const body = await (await GET(req("today"))).json();
    expect(body.chartType).toBe("power");
    expect(mockStats).toHaveBeenCalledWith(expect.any(Array), expect.any(String), expect.any(String), "hour");
    expect(body.summary.producedKwh).toBe(1.4);
  });
});
