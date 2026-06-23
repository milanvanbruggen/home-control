import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/ha-client", () => ({
  getStates: vi.fn(),
  HaError: class HaError extends Error { status: number; constructor(m: string, s: number){ super(m); this.status = s; } },
}));

import { getStates, HaError } from "@/lib/ha-client";
import { GET } from "@/app/api/state/route";

describe("GET /api/state", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns mapped AppState on success", async () => {
    (getStates as any).mockResolvedValue([
      { entity_id: "climate.zolder_chill", state: "cool",
        attributes: { current_temperature: 24, temperature: 18, fan_mode: "Hoog",
          fan_modes: ["Laag","Normaal","Hoog"], min_temp: 16, max_temp: 30, target_temp_step: 1 } },
    ]);
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.chills[0].id).toBe("climate.zolder_chill");
    expect(body.scenes).toHaveLength(8);
  });

  it("returns 502 when HA errors", async () => {
    (getStates as any).mockRejectedValue(new HaError("down", 502));
    const res = await GET();
    expect(res.status).toBe(502);
    expect((await res.json()).error).toBe("state_unavailable");
  });
});
