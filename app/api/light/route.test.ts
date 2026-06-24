import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/ha-client", () => ({
  callService: vi.fn(),
  statusForError: (e: unknown) =>
    e && typeof e === "object" && "status" in e && (e as { status: number }).status === 502 ? 502 : 502,
  HaError: class HaError extends Error { status: number; constructor(m: string, s: number){ super(m); this.status = s; } },
}));

import { callService } from "@/lib/ha-client";
import { ALL_LIGHT_GROUPS } from "@/config/devices";
import { POST } from "@/app/api/light/route";

function post(body: unknown): Request {
  return new Request("http://localhost/api/light", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
}

describe("POST /api/light", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (callService as any).mockResolvedValue(undefined);
  });

  it("sets brightness on a whitelisted light", async () => {
    const res = await POST(post({ id: "light.woonkamer", brightness: 70 }));
    expect(res.status).toBe(200);
    expect(callService).toHaveBeenCalledWith("light", "turn_on", { entity_id: "light.woonkamer", brightness_pct: 70 });
  });

  it("turns the light off when brightness is 0", async () => {
    const res = await POST(post({ id: "light.woonkamer", brightness: 0 }));
    expect(res.status).toBe(200);
    expect(callService).toHaveBeenCalledWith("light", "turn_off", { entity_id: "light.woonkamer" });
  });

  it("sets brightness on another room's light group", async () => {
    const res = await POST(post({ id: "light.keuken", brightness: 55 }));
    expect(res.status).toBe(200);
    expect(callService).toHaveBeenCalledWith("light", "turn_on", { entity_id: "light.keuken", brightness_pct: 55 });
  });

  it("rejects a non-whitelisted light with 400", async () => {
    const res = await POST(post({ id: "light.badkamer", brightness: 50 }));
    expect(res.status).toBe(400);
    expect(callService).not.toHaveBeenCalled();
  });

  it("rejects out-of-range / non-integer brightness with 400", async () => {
    expect((await POST(post({ id: "light.woonkamer", brightness: 150 }))).status).toBe(400);
    expect((await POST(post({ id: "light.woonkamer", brightness: 33.5 }))).status).toBe(400);
    expect(callService).not.toHaveBeenCalled();
  });

  it("rejects a malformed body with 400", async () => {
    const res = await POST(post({ id: "light.woonkamer" }));
    expect(res.status).toBe(400);
    expect(callService).not.toHaveBeenCalled();
  });

  it("turns off all house lights for id 'all' and clears every active scene", async () => {
    const { setActiveScene, getActiveScene } = await import("@/lib/active-scene");
    setActiveScene("woonkamer", "scene.woonkamer_helder");
    setActiveScene("keuken", "scene.keuken_helder");
    const res = await POST(post({ id: "all", brightness: 0 }));
    expect(res.status).toBe(200);
    expect(callService).toHaveBeenCalledWith("light", "turn_off", { entity_id: ALL_LIGHT_GROUPS });
    expect(getActiveScene("woonkamer")).toBeNull();
    expect(getActiveScene("keuken")).toBeNull();
  });

  it("turning a room's light off (brightness 0) clears that room's active scene", async () => {
    const { setActiveScene, getActiveScene, clearAllActiveScenes } = await import("@/lib/active-scene");
    clearAllActiveScenes();
    setActiveScene("woonkamer", "scene.woonkamer_helder");
    const res = await POST(post({ id: "light.woonkamer", brightness: 0 }));
    expect(res.status).toBe(200);
    expect(callService).toHaveBeenCalledWith("light", "turn_off", { entity_id: "light.woonkamer" });
    expect(getActiveScene("woonkamer")).toBeNull();
  });

  it("returns 502 when the HA call fails", async () => {
    const { HaError } = await import("@/lib/ha-client");
    (callService as any).mockRejectedValue(new HaError("fail", 502));
    const res = await POST(post({ id: "light.woonkamer", brightness: 60 }));
    expect(res.status).toBe(502);
  });
});
