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
import { GET } from "@/app/api/state/route";

describe("GET /api/state", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns mapped AppState on success", async () => {
    (getStates as any).mockResolvedValue([
      { entity_id: "climate.zolder", state: "cool",
        attributes: { current_temperature: 24, temperature: 18, fan_mode: "Hoog",
          fan_modes: ["Laag","Normaal","Hoog"], min_temp: 16, max_temp: 30, target_temp_step: 1 } },
    ]);
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.chills[0].id).toBe("climate.zolder");
    expect(body.scenes).toHaveLength(8);
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
});
