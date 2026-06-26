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
      "sensor.a": [{ start: 1782424800000, end: 1782428400000, change: 1.5 }, { start: 1782428400000, end: 1782432000000, change: 2.0 }],
      "sensor.b": [{ start: 1782424800000, end: 1782428400000, change: 0 }],
    } });
    await expect(p).resolves.toEqual({
      "sensor.a": [{ start: 1782424800000, end: 1782428400000, change: 1.5 }, { start: 1782428400000, end: 1782432000000, change: 2.0 }],
      "sensor.b": [{ start: 1782424800000, end: 1782428400000, change: 0 }],
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

  it("coerces epoch-second timestamps and ISO string timestamps to epoch ms", async () => {
    const ws = fakeWS();
    const p = getStatistics(["sensor.c"], "2026-06-01T00:00:00Z", "2026-06-26T00:00:00Z", "hour", { connect: () => ws });
    emit(ws, { type: "auth_required" });
    emit(ws, { type: "auth_ok" });
    // epoch seconds (< 1e12): should be multiplied by 1000
    // ISO string: should be parsed via Date.parse
    emit(ws, { type: "result", success: true, result: {
      "sensor.c": [
        { start: 1782424800, end: 1782428400, change: 3.0 },
        { start: "2026-05-26T22:00:00.000Z", end: "2026-05-26T23:00:00.000Z", change: 4.5 },
      ],
    } });
    const result = await p;
    // epoch seconds → ms
    expect(result["sensor.c"][0].start).toBe(1782424800000);
    expect(result["sensor.c"][0].end).toBe(1782428400000);
    expect(result["sensor.c"][0].change).toBe(3.0);
    // ISO string → ms via Date.parse
    expect(result["sensor.c"][1].start).toBe(Date.parse("2026-05-26T22:00:00.000Z"));
    expect(result["sensor.c"][1].end).toBe(Date.parse("2026-05-26T23:00:00.000Z"));
    expect(result["sensor.c"][1].change).toBe(4.5);
  });

  it("requests the given statistic types and maps max points", async () => {
    const ws = fakeWS();
    const p = getStatistics(["sensor.p"], "2026-06-12T00:00:00Z", "2026-06-26T00:00:00Z", "hour", { connect: () => ws, types: ["max"] });
    emit(ws, { type: "auth_required" });
    emit(ws, { type: "auth_ok" });
    const cmd = JSON.parse(ws.sent[1]);
    expect(cmd).toMatchObject({ type: "recorder/statistics_during_period", period: "hour", statistic_ids: ["sensor.p"], types: ["max"] });
    emit(ws, { id: cmd.id, type: "result", success: true, result: {
      "sensor.p": [{ start: 1782424800000, end: 1782428400000, max: 1304 }],
    } });
    const result = await p;
    expect(result["sensor.p"][0].max).toBe(1304);
    expect(result["sensor.p"][0].start).toBe(1782424800000);
  });
});
