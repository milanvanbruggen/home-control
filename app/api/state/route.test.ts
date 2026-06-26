import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/ha-client", () => {
  class HaError extends Error { status: number; constructor(m: string, s: number){ super(m); this.status = s; } }
  return {
    getStates: vi.fn(),
    HaError,
    statusForError: (e: unknown) => {
      if (e instanceof HaError) {
        return e.status === 503 || e.status === 401 || e.status === 403 ? 503 : 502;
      }
      return 500;
    },
  };
});

import { getStates, HaError } from "@/lib/ha-client";
import { getActiveScene, setActiveScene, clearActiveScene } from "@/lib/active-scene";
import { _setSunEnvelope, _resetSunCache } from "@/lib/sun-strength";
import { GET } from "@/app/api/state/route";

describe("GET /api/state", () => {
  beforeEach(() => { vi.clearAllMocks(); clearActiveScene(); });

  it("returns mapped AppState (chills + 7 rooms) on success", async () => {
    (getStates as any).mockResolvedValue([
      { entity_id: "climate.zolder", state: "cool",
        attributes: { current_temperature: 24, temperature: 18, fan_mode: "Hoog",
          fan_modes: ["Laag","Normaal","Hoog"], min_temp: 16, max_temp: 30, target_temp_step: 1 } },
    ]);
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.chills[0].id).toBe("climate.zolder");
    expect(body.rooms).toHaveLength(7);
    expect(body.rooms.find((r: { key: string }) => r.key === "woonkamer").activeScene).toBeNull();
  });

  it("includes the per-room active scene from the server-side store", async () => {
    (getStates as any).mockResolvedValue([]);
    setActiveScene("woonkamer", "scene.woonkamer_lezen");
    const res = await GET();
    const body = await res.json();
    expect(body.rooms.find((r: { key: string }) => r.key === "woonkamer").activeScene).toBe("scene.woonkamer_lezen");
    expect(getActiveScene("woonkamer")).toBe("scene.woonkamer_lezen");
  });

  it("returns 502 when HA errors", async () => {
    (getStates as any).mockRejectedValue(new HaError("down", 502));
    const res = await GET();
    expect(res.status).toBe(502);
    expect((await res.json()).error).toBe("state_unavailable");
  });

  it("returns 500 on an unexpected (non-HaError) error", async () => {
    (getStates as any).mockRejectedValue(new Error("unexpected"));
    const res = await GET();
    expect(res.status).toBe(500);
    expect((await res.json()).error).toBe("state_unavailable");
  });

  it("returns 503 when HA throws a config error (HaError 503)", async () => {
    (getStates as any).mockRejectedValue(new HaError("no token", 503));
    const res = await GET();
    expect(res.status).toBe(503);
  });

  it("returns 503 when HA returns 401 unauthorized (HaError 401)", async () => {
    (getStates as any).mockRejectedValue(new HaError("unauthorized", 401));
    const res = await GET();
    expect(res.status).toBe(503);
  });

  it("brightens solar.sky.cloudCoverage when production proves strong sun", async () => {
    _setSunEnvelope({ hourMaxW: new Array(24).fill(1300), days: 14, tz: "UTC" });
    (getStates as any).mockResolvedValue([
      { entity_id: "weather.forecast_home", state: "partlycloudy", attributes: { cloud_coverage: 93 } },
      { entity_id: "sun.sun", state: "above_horizon", attributes: {} },
      { entity_id: "sensor.solaredge_current_power", state: "1200", attributes: {} },
    ]);
    const res = await GET();
    const body = await res.json();
    expect(body.solar.sky.cloudCoverage).toBe(20); // min(93, production-implied 20)
    _resetSunCache();
  });
});
