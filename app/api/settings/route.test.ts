import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { GET, PUT } from "@/app/api/settings/route";
import { _resetSettingsCache } from "@/lib/settings-store";

let tmpFile: string;
let n = 0;

beforeEach(() => {
  tmpFile = path.join(os.tmpdir(), `settings-route-${process.pid}-${n++}.json`);
  process.env.SETTINGS_PATH = tmpFile;
  _resetSettingsCache();
});
afterEach(() => {
  try { fs.rmSync(tmpFile); } catch { /* ignore */ }
  delete process.env.SETTINGS_PATH;
  _resetSettingsCache();
});

function put(body: unknown): Request {
  return new Request("http://localhost/api/settings", {
    method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
}

describe("POST /api/settings", () => {
  it("GET returns the defaults", async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ language: "en", theme: "system", favorites: {}, waterAlert: true, hiddenMetrics: {}, cardOrder: [], tariff: { mode: "simple", importPrice: null, exportPrice: null, importLow: null, importHigh: null, feedInPrice: null, fixedFeedInPerDay: null } });
  });

  it("PUT updates waterAlert and persists", async () => {
    const res = await PUT(put({ waterAlert: false }));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ waterAlert: false });
    _resetSettingsCache();
    expect((await (await GET()).json()).waterAlert).toBe(false);
  });

  it("PUT updates language + theme and persists (GET reflects it)", async () => {
    const res = await PUT(put({ language: "nl", theme: "dark" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ language: "nl", theme: "dark" });
    _resetSettingsCache();
    expect(await (await GET()).json()).toMatchObject({ language: "nl", theme: "dark" });
  });

  it("rejects an invalid theme with 400 (no corruption)", async () => {
    expect((await PUT(put({ theme: "neon" }))).status).toBe(400);
    _resetSettingsCache();
    expect(await (await GET()).json()).toMatchObject({ theme: "system" });
  });

  it("strips unknown fields", async () => {
    await PUT(put({ theme: "dark", bogus: 1 }));
    _resetSettingsCache();
    expect(await (await GET()).json()).toMatchObject({ theme: "dark" });
  });

  it("PUT updates hiddenMetrics and persists", async () => {
    const res = await PUT(put({ hiddenMetrics: { woonkamer: ["humidity"] } }));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ hiddenMetrics: { woonkamer: ["humidity"] } });
    _resetSettingsCache();
    expect((await (await GET()).json()).hiddenMetrics).toEqual({ woonkamer: ["humidity"] });
  });
});
