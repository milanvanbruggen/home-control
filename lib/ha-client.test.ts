import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

describe("ha-client", () => {
  beforeEach(() => {
    vi.stubEnv("HA_URL", "http://ha.local:8123");
    vi.stubEnv("HA_TOKEN", "tok123");
    vi.stubGlobal("fetch", vi.fn());
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it("getStates calls HA /api/states with bearer token", async () => {
    (fetch as any).mockResolvedValue({ ok: true, json: async () => [{ entity_id: "x", state: "on", attributes: {} }] });
    const { getStates } = await import("@/lib/ha-client");
    const states = await getStates();
    expect(states).toHaveLength(1);
    expect(fetch).toHaveBeenCalledWith(
      "http://ha.local:8123/api/states",
      expect.objectContaining({ headers: { Authorization: "Bearer tok123" }, cache: "no-store" }),
    );
  });

  it("getStates throws HaError with status on non-ok", async () => {
    (fetch as any).mockResolvedValue({ ok: false, status: 401 });
    const { getStates, HaError } = await import("@/lib/ha-client");
    await expect(getStates()).rejects.toMatchObject({ status: 401 });
    await expect(getStates()).rejects.toBeInstanceOf(HaError);
  });

  it("callService POSTs to the service endpoint with JSON body", async () => {
    (fetch as any).mockResolvedValue({ ok: true, json: async () => [] });
    const { callService } = await import("@/lib/ha-client");
    await callService("climate", "set_temperature", { entity_id: "climate.zolder_chill", temperature: 20 });
    expect(fetch).toHaveBeenCalledWith(
      "http://ha.local:8123/api/services/climate/set_temperature",
      expect.objectContaining({
        method: "POST",
        headers: { Authorization: "Bearer tok123", "Content-Type": "application/json" },
        body: JSON.stringify({ entity_id: "climate.zolder_chill", temperature: 20 }),
        cache: "no-store",
      }),
    );
  });

  it("callService throws HaError on non-ok", async () => {
    (fetch as any).mockResolvedValue({ ok: false, status: 502 });
    const { callService } = await import("@/lib/ha-client");
    await expect(callService("scene", "turn_on", { entity_id: "scene.woonkamer_uit" }))
      .rejects.toMatchObject({ status: 502 });
  });
});
