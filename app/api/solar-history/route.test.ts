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
  mockSettings.mockReturnValue({ tariff: { importPrice: null, exportPrice: null } });
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

  it("omits cost (null) when no tariff is set", async () => {
    mockHistory.mockResolvedValue([]); // any range; no tariff
    const res = await GET(req("week"));
    const body = await res.json();
    expect(body.summary.cost).toBeNull();
  });

  it("computes cost and earnings when a tariff is set", async () => {
    mockSettings.mockReturnValue({ tariff: { importPrice: 0.23, exportPrice: 0.08 } });
    // Lifetime/meter histories keyed by entity id; week range start..now deltas:
    const series = (start: string, end: string) => [
      { state: start, last_changed: "2026-06-18T00:00:00Z" },
      { state: end, last_changed: "2026-06-25T00:00:00Z" },
    ];
    mockHistory.mockImplementation((id: string) => {
      if (id === "sensor.solaredge_lifetime_energy") return Promise.resolve(series("0", "7000"));
      if (id === "sensor.electricity_meter_energy_consumption_tarif_1") return Promise.resolve(series("0", "5000"));   // +5 kWh
      if (id === "sensor.electricity_meter_energy_consumption_tarif_2") return Promise.resolve(series("0", "5000"));   // +5 kWh -> import 10
      if (id === "sensor.electricity_meter_energy_production_tarif_1") return Promise.resolve(series("0", "2000"));    // +2 kWh
      if (id === "sensor.electricity_meter_energy_production_tarif_2") return Promise.resolve(series("0", "3000"));    // +3 kWh -> export 5
      return Promise.resolve([]);
    });
    const res = await GET(req("week"));
    const body = await res.json();
    expect(body.summary.cost.importKwh).toBe(10);
    expect(body.summary.cost.exportKwh).toBe(5);
    expect(body.summary.cost.importCost).toBe(2.3);     // 10 * 0.23
    expect(body.summary.cost.exportEarnings).toBe(0.4); // 5 * 0.08
  });

  it("returns cost null (not a throw) when the meter history fails", async () => {
    mockSettings.mockReturnValue({ tariff: { importPrice: 0.23, exportPrice: 0.08 } });
    mockHistory.mockImplementation((id: string) => {
      if (id.startsWith("sensor.electricity_meter")) return Promise.reject(new Error("boom"));
      return Promise.resolve([]);
    });
    const res = await GET(req("week"));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.summary.cost).toBeNull();
  });
});
