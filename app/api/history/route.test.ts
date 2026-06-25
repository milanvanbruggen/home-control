import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { GET } from "@/app/api/history/route";
import { writeSample } from "@/lib/metrics-history-store";

let dir: string;
let n = 0;

beforeEach(() => {
  dir = path.join(os.tmpdir(), `hist-route-${process.pid}-${n++}`);
  fs.mkdirSync(dir, { recursive: true });
  process.env.DATA_DIR = dir;
});
afterEach(() => {
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ }
  delete process.env.DATA_DIR;
});

function req(qs: string): Request {
  return new Request(`http://localhost/api/history?${qs}`);
}

describe("GET /api/history", () => {
  it("returns series for a valid room + range", async () => {
    const now = Date.now();
    writeSample({ t: now - 1000, v: { "woonkamer.temperature": 21.4, "woonkamer.humidity": 48 } }, now - 1000);
    writeSample({ t: now - 500, v: { "woonkamer.temperature": 21.6, "woonkamer.humidity": 47 } }, now - 500);
    const res = await GET(req("room=woonkamer&range=24h"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.room).toBe("woonkamer");
    const temp = body.series.find((s: { kind: string }) => s.kind === "temperature");
    expect(temp.unit).toBe("°C");
    expect(temp.points.length).toBeGreaterThanOrEqual(2);
    expect(temp.points.at(-1).value).toBe(21.6);
  });

  it("400s an unknown room or bad range", async () => {
    expect((await GET(req("room=garage&range=24h"))).status).toBe(400);
    expect((await GET(req("room=woonkamer&range=99y"))).status).toBe(400);
  });
});
