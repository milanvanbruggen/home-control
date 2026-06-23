import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/ha-client", () => {
  class HaError extends Error { status: number; constructor(m: string, s: number){ super(m); this.status = s; } }
  return {
    getStates: vi.fn(),
    callService: vi.fn(),
    HaError,
    statusForError: (e: unknown) => {
      if (e instanceof HaError) {
        return e.status === 503 || e.status === 401 || e.status === 403 ? 503 : 502;
      }
      return 500;
    },
  };
});

import { getStates, callService } from "@/lib/ha-client";
import { POST } from "@/app/api/climate/route";

const zolderState = {
  entity_id: "climate.zolder", state: "cool",
  attributes: { current_temperature: 24, temperature: 18, fan_mode: "Hoog",
    fan_modes: ["Laag", "Normaal", "Hoog"], min_temp: 16, max_temp: 30, target_temp_step: 1 },
};

function post(body: unknown): Request {
  return new Request("http://localhost/api/climate", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
}

describe("POST /api/climate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (getStates as any).mockResolvedValue([zolderState]);
    (callService as any).mockResolvedValue(undefined);
  });

  it("sets a valid temperature", async () => {
    const res = await POST(post({ id: "climate.zolder", action: "set_temp", value: 20 }));
    expect(res.status).toBe(200);
    expect(callService).toHaveBeenCalledWith("climate", "set_temperature",
      { entity_id: "climate.zolder", temperature: 20 });
  });

  it("rejects an entity not on the allowlist with 400", async () => {
    const res = await POST(post({ id: "climate.evil", action: "set_temp", value: 20 }));
    expect(res.status).toBe(400);
    expect(callService).not.toHaveBeenCalled();
  });

  it("rejects an action the device does not allow (thermostat fan) with 400", async () => {
    (getStates as any).mockResolvedValue([{ entity_id: "climate.thermostaat", state: "heat",
      attributes: { current_temperature: 19, temperature: 20, min_temp: 5, max_temp: 30, target_temp_step: 0.5 } }]);
    const res = await POST(post({ id: "climate.thermostaat", action: "set_fan", value: "Hoog" }));
    expect(res.status).toBe(400);
    expect(callService).not.toHaveBeenCalled();
  });

  it("rejects an out-of-range temp with 400", async () => {
    const res = await POST(post({ id: "climate.zolder", action: "set_temp", value: 99 }));
    expect(res.status).toBe(400);
    expect(callService).not.toHaveBeenCalled();
  });

  it("rejects a malformed body with 400", async () => {
    const res = await POST(post({ id: "climate.zolder" }));
    expect(res.status).toBe(400);
    expect(callService).not.toHaveBeenCalled();
  });

  it("returns 502 when the HA service call fails", async () => {
    const { HaError } = await import("@/lib/ha-client");
    (callService as any).mockRejectedValue(new HaError("fail", 502));
    const res = await POST(post({ id: "climate.zolder", action: "set_mode", value: "heat" }));
    expect(res.status).toBe(502);
  });
});
