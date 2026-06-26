import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { getStatistics } from "@/lib/ha-stats";

type MsgHandler = ((ev: { data: string }) => void) | null;
function fakeWS() {
  const ws: { sent: string[]; onopen: ((ev?: unknown) => void) | null; onmessage: MsgHandler; onerror: ((e: unknown) => void) | null; closed: boolean; send(d: string): void; close(): void } = {
    sent: [], onopen: null, onmessage: null, onerror: null, closed: false,
    send(d: string) { this.sent.push(d); }, close() { this.closed = true; },
  };
  return ws;
}
function emit(ws: ReturnType<typeof fakeWS>, obj: unknown) { ws.onmessage?.({ data: JSON.stringify(obj) }); }

beforeEach(() => { vi.stubEnv("HA_URL", "http://ha.test:8123"); vi.stubEnv("HA_TOKEN", "tok"); });
afterEach(() => vi.unstubAllEnvs());

describe("getStatistics", () => {
  it("authenticates, sends the statistics command, and resolves parsed change points", async () => {
    const ws = fakeWS();
    const p = getStatistics(["sensor.a", "sensor.b"], "2026-06-01T00:00:00Z", "2026-06-26T00:00:00Z", "day", { connect: () => ws });
    emit(ws, { type: "auth_required" });
    expect(JSON.parse(ws.sent[0])).toEqual({ type: "auth", access_token: "tok" });
    emit(ws, { type: "auth_ok" });
    const cmd = JSON.parse(ws.sent[1]);
    expect(cmd).toMatchObject({ type: "recorder/statistics_during_period", period: "day", statistic_ids: ["sensor.a", "sensor.b"], types: ["change"], start_time: "2026-06-01T00:00:00Z", end_time: "2026-06-26T00:00:00Z" });
    emit(ws, { id: cmd.id, type: "result", success: true, result: {
      "sensor.a": [{ start: 1, end: 2, change: 1.5 }, { start: 2, end: 3, change: 2.0 }],
      "sensor.b": [{ start: 1, end: 2, change: 0 }],
    } });
    await expect(p).resolves.toEqual({
      "sensor.a": [{ start: 1, end: 2, change: 1.5 }, { start: 2, end: 3, change: 2.0 }],
      "sensor.b": [{ start: 1, end: 2, change: 0 }],
    });
    expect(ws.closed).toBe(true);
  });

  it("rejects on auth_invalid", async () => {
    const ws = fakeWS();
    const p = getStatistics(["sensor.a"], "s", "e", "day", { connect: () => ws });
    emit(ws, { type: "auth_required" });
    emit(ws, { type: "auth_invalid" });
    await expect(p).rejects.toThrow();
  });

  it("rejects when the result is not successful", async () => {
    const ws = fakeWS();
    const p = getStatistics(["sensor.a"], "s", "e", "day", { connect: () => ws });
    emit(ws, { type: "auth_required" });
    emit(ws, { type: "auth_ok" });
    emit(ws, { type: "result", success: false, error: { message: "nope" } });
    await expect(p).rejects.toThrow();
  });
});
