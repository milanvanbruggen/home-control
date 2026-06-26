import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@/lib/ha-client", () => ({
  getHistory: vi.fn(),
  statusForError: () => 502,
}));
vi.mock("@/lib/settings-store", () => ({ getSettings: vi.fn() }));
import { getHistory } from "@/lib/ha-client";
import { getSettings } from "@/lib/settings-store";
import { GET } from "@/app/api/solar-history/route";

const mockHistory = getHistory as unknown as ReturnType<typeof vi.fn>;
const mockSettings = getSettings as unknown as ReturnType<typeof vi.fn>;

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
    mockHistory
      .mockResolvedValueOnce([ // current_power
        { state: "1000", last_changed: "2026-06-25T09:00:00Z" },
        { state: "2000", last_changed: "2026-06-25T10:00:00Z" },
      ])
      .mockResolvedValueOnce([ // lifetime_energy
        { state: "1000", last_changed: "2026-06-25T00:00:00Z" },
        { state: "6000", last_changed: "2026-06-25T11:00:00Z" }, // +5000 Wh = 5 kWh
      ]);
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

  it("computes simple-mode cost in euros from kWh meters (not 1000x too low)", async () => {
    mockSettings.mockReturnValue({ tariff: { mode: "simple", importPrice: 0.25, exportPrice: 0.1, importLow: null, importHigh: null, feedInPrice: null, fixedFeedInPerDay: null } });
    // cumulative kWh meters; the route fetches from start-2d, delta over [weekStart, now]
    const meter = (start: string, end: string) => [
      { state: start, last_changed: "2026-06-18T00:00:00Z" }, // before weekStart (margin)
      { state: end, last_changed: "2026-06-25T00:00:00Z" },
    ];
    mockHistory.mockImplementation((id: string) => {
      if (id === "sensor.solaredge_lifetime_energy") return Promise.resolve(meter("0", "7000"));
      if (id === "sensor.electricity_meter_energy_consumption_tarif_1") return Promise.resolve(meter("0", "30"));
      if (id === "sensor.electricity_meter_energy_consumption_tarif_2") return Promise.resolve(meter("0", "14")); // import 44 kWh
      if (id === "sensor.electricity_meter_energy_production_tarif_1") return Promise.resolve(meter("0", "2"));
      if (id === "sensor.electricity_meter_energy_production_tarif_2") return Promise.resolve(meter("0", "3"));   // export 5 kWh
      return Promise.resolve([]);
    });
    const body = await (await GET(req("week"))).json();
    expect(body.summary.cost.importKwh).toBe(44);
    expect(body.summary.cost.importCost).toBe(11);   // 44 * 0.25 — guards the unit bug
    expect(body.summary.cost.exportKwh).toBe(5);
    expect(body.summary.cost.exportEarnings).toBe(0.5);
  });

  it("omits cost (null) when no usable tariff is set", async () => {
    mockHistory.mockResolvedValue([]);
    const body = await (await GET(req("week"))).json();
    expect(body.summary.cost).toBeNull();
  });

  it("returns cost null (not a throw) when a meter history fails", async () => {
    mockSettings.mockReturnValue({ tariff: { mode: "simple", importPrice: 0.25, exportPrice: 0.1, importLow: null, importHigh: null, feedInPrice: null, fixedFeedInPerDay: null } });
    mockHistory.mockImplementation((id: string) => id.startsWith("sensor.electricity_meter") ? Promise.reject(new Error("boom")) : Promise.resolve([]));
    const res = await GET(req("week"));
    expect(res.status).toBe(200);
    expect((await res.json()).summary.cost).toBeNull();
  });
});
