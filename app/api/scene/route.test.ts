import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/ha-client", () => ({
  callService: vi.fn(),
  HaError: class HaError extends Error { status: number; constructor(m: string, s: number){ super(m); this.status = s; } },
}));

import { callService } from "@/lib/ha-client";
import { getActiveScene, clearActiveScene } from "@/lib/active-scene";
import { POST } from "@/app/api/scene/route";

function post(body: unknown): Request {
  return new Request("http://localhost/api/scene", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
}

describe("POST /api/scene", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (callService as any).mockResolvedValue(undefined);
    clearActiveScene();
  });

  it("activates a whitelisted scene", async () => {
    const res = await POST(post({ id: "scene.woonkamer_ontspannen" }));
    expect(res.status).toBe(200);
    expect(callService).toHaveBeenCalledWith("scene", "turn_on", { entity_id: "scene.woonkamer_ontspannen" });
  });

  it("maps 'Uit' to turning the woonkamer light group off", async () => {
    const res = await POST(post({ id: "woonkamer_uit" }));
    expect(res.status).toBe(200);
    expect(callService).toHaveBeenCalledWith("light", "turn_off", { entity_id: "light.woonkamer" });
  });

  it("rejects a non-whitelisted scene with 400", async () => {
    const res = await POST(post({ id: "scene.bedroom_secret" }));
    expect(res.status).toBe(400);
    expect(callService).not.toHaveBeenCalled();
  });

  it("rejects a malformed body with 400", async () => {
    const res = await POST(post({}));
    expect(res.status).toBe(400);
    expect(callService).not.toHaveBeenCalled();
  });

  it("returns 502 when the HA call fails", async () => {
    const { HaError } = await import("@/lib/ha-client");
    (callService as any).mockRejectedValue(new HaError("fail", 502));
    const res = await POST(post({ id: "scene.woonkamer_ontspannen" }));
    expect(res.status).toBe(502);
  });

  it("remembers the active scene after activating one", async () => {
    await POST(post({ id: "scene.woonkamer_ontspannen" }));
    expect(getActiveScene()).toBe("scene.woonkamer_ontspannen");
  });

  it("'Uit' clears the active scene", async () => {
    await POST(post({ id: "scene.woonkamer_ontspannen" }));
    await POST(post({ id: "woonkamer_uit" }));
    expect(getActiveScene()).toBeNull();
  });

  it("does not set an active scene when the HA call fails", async () => {
    const { HaError } = await import("@/lib/ha-client");
    (callService as any).mockRejectedValue(new HaError("fail", 502));
    await POST(post({ id: "scene.woonkamer_ontspannen" }));
    expect(getActiveScene()).toBeNull();
  });
});
