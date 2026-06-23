import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/ha-client", () => {
  class HaError extends Error { status: number; constructor(m: string, s: number){ super(m); this.status = s; } }
  return {
    getStates: vi.fn(),
    callService: vi.fn(),
    HaError,
    statusForError: (e: unknown) =>
      e instanceof HaError ? (e.status === 503 || e.status === 401 || e.status === 403 ? 503 : 502) : 500,
  };
});

import { getStates, callService } from "@/lib/ha-client";
import { getActiveScene, clearActiveScene } from "@/lib/active-scene";
import { POST } from "@/app/api/scene/route";

// HA scene entities used for dynamic validation.
const SCENES = [
  { entity_id: "scene.woonkamer_ontspannen", state: "x", attributes: { group_type: "room", group_name: "Woonkamer", name: "Ontspannen" } },
  { entity_id: "scene.keuken_helder", state: "x", attributes: { group_type: "room", group_name: "Keuken", name: "Helder" } },
  { entity_id: "scene.garage_secret", state: "x", attributes: { group_type: "room", group_name: "Garage", name: "Secret" } },
];

function post(body: unknown): Request {
  return new Request("http://localhost/api/scene", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
}

describe("POST /api/scene", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (callService as any).mockResolvedValue(undefined);
    (getStates as any).mockResolvedValue(SCENES);
    clearActiveScene();
  });

  it("activates a scene in an allowed room and remembers it per room", async () => {
    const res = await POST(post({ id: "scene.woonkamer_ontspannen" }));
    expect(res.status).toBe(200);
    expect(callService).toHaveBeenCalledWith("scene", "turn_on", { entity_id: "scene.woonkamer_ontspannen" });
    expect(getActiveScene("woonkamer")).toBe("scene.woonkamer_ontspannen");
  });

  it("activates a non-woonkamer room scene", async () => {
    const res = await POST(post({ id: "scene.keuken_helder" }));
    expect(res.status).toBe(200);
    expect(getActiveScene("keuken")).toBe("scene.keuken_helder");
  });

  it("rejects a scene in a NON-allowed room with 400", async () => {
    const res = await POST(post({ id: "scene.garage_secret" }));
    expect(res.status).toBe(400);
    expect(callService).not.toHaveBeenCalled();
  });

  it("rejects an unknown scene id with 400", async () => {
    const res = await POST(post({ id: "scene.woonkamer_does_not_exist" }));
    expect(res.status).toBe(400);
    expect(callService).not.toHaveBeenCalled();
  });

  it("rejects a non-scene id with 400 (no HA call)", async () => {
    const res = await POST(post({ id: "light.woonkamer" }));
    expect(res.status).toBe(400);
    expect(getStates).not.toHaveBeenCalled();
    expect(callService).not.toHaveBeenCalled();
  });

  it("maps a room 'Uit' to turning that room's light group off and clears its active scene", async () => {
    await POST(post({ id: "scene.keuken_helder" }));
    expect(getActiveScene("keuken")).toBe("scene.keuken_helder");
    const res = await POST(post({ id: "keuken_uit" }));
    expect(res.status).toBe(200);
    expect(callService).toHaveBeenCalledWith("light", "turn_off", { entity_id: "light.keuken" });
    expect(getActiveScene("keuken")).toBeNull();
  });

  it("rejects a malformed body with 400", async () => {
    const res = await POST(post({}));
    expect(res.status).toBe(400);
  });

  it("returns 502 when the HA service call fails", async () => {
    const { HaError } = await import("@/lib/ha-client");
    (callService as any).mockRejectedValue(new HaError("fail", 502));
    const res = await POST(post({ id: "scene.woonkamer_ontspannen" }));
    expect(res.status).toBe(502);
  });

  it("returns 502 when fetching states fails", async () => {
    const { HaError } = await import("@/lib/ha-client");
    (getStates as any).mockRejectedValue(new HaError("down", 502));
    const res = await POST(post({ id: "scene.woonkamer_ontspannen" }));
    expect(res.status).toBe(502);
  });
});
