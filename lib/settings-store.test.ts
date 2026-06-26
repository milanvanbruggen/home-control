import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { getSettings, updateSettings, _resetSettingsCache } from "@/lib/settings-store";

let tmpFile: string;
let n = 0;

beforeEach(() => {
  tmpFile = path.join(os.tmpdir(), `settings-store-${process.pid}-${n++}.json`);
  process.env.SETTINGS_PATH = tmpFile;
  _resetSettingsCache();
});
afterEach(() => {
  try { fs.rmSync(tmpFile); } catch { /* ignore */ }
  delete process.env.SETTINGS_PATH;
  _resetSettingsCache();
});

describe("settings-store", () => {
  it("returns defaults when no file exists", () => {
    expect(getSettings()).toEqual({ language: "en", theme: "system", favorites: {}, waterAlert: true, hiddenMetrics: {}, cardOrder: [], tariff: { mode: "simple", importPrice: null, exportPrice: null, importLow: null, importHigh: null, feedInPrice: null, fixedFeedInPerDay: null } });
  });

  it("persists and reads back an update (round-trip)", () => {
    updateSettings({ language: "nl", theme: "dark" });
    _resetSettingsCache();
    expect(getSettings()).toMatchObject({ language: "nl", theme: "dark" });
    expect(fs.existsSync(tmpFile)).toBe(true);
  });

  it("merges a patch, keeping untouched fields", () => {
    updateSettings({ language: "nl", theme: "dark" });
    updateSettings({ theme: "light" });
    _resetSettingsCache();
    expect(getSettings()).toMatchObject({ language: "nl", theme: "light" });
  });

  it("drops invalid language/theme values", () => {
    updateSettings({ language: "klingon" as never, theme: "neon" as never });
    _resetSettingsCache();
    expect(getSettings()).toMatchObject({ language: "en", theme: "system" });
  });

  it("keeps only allowed-room favorites with scene.* ids", () => {
    updateSettings({
      favorites: { woonkamer: ["scene.a", "light.bad", 5 as never], nope: ["scene.x"] },
    });
    _resetSettingsCache();
    expect(getSettings().favorites).toEqual({ woonkamer: ["scene.a"] });
  });

  it("persists waterAlert (round-trip)", () => {
    updateSettings({ waterAlert: false });
    _resetSettingsCache();
    expect(getSettings().waterAlert).toBe(false);
  });

  it("defaults waterAlert to true when the stored value isn't a boolean", () => {
    fs.writeFileSync(tmpFile, JSON.stringify({ waterAlert: "yes" }));
    _resetSettingsCache();
    expect(getSettings().waterAlert).toBe(true);
  });

  it("keeps only known metric rooms + known metric kinds in hiddenMetrics", () => {
    updateSettings({
      hiddenMetrics: { woonkamer: ["humidity", "bogus"], nope: ["temperature"] } as never,
    });
    _resetSettingsCache();
    expect(getSettings().hiddenMetrics).toEqual({ woonkamer: ["humidity"] });
  });

  it("round-trips a hiddenMetrics update and merges with other fields", () => {
    updateSettings({ theme: "dark" });
    updateSettings({ hiddenMetrics: { zolder: ["temperature"] } });
    _resetSettingsCache();
    expect(getSettings()).toMatchObject({ theme: "dark", hiddenMetrics: { zolder: ["temperature"] } });
  });
});

describe("tariff settings", () => {
  const full = {
    mode: "simple" as const,
    importPrice: null, exportPrice: null,
    importLow: null, importHigh: null, feedInPrice: null, fixedFeedInPerDay: null,
  };
  it("defaults tariff to simple mode with null prices", () => {
    expect(getSettings().tariff).toEqual(full);
  });
  it("persists advanced dual-tariff fields", () => {
    const t = { ...full, mode: "advanced" as const, importLow: 0.22216, importHigh: 0.25514, feedInPrice: 0.14, fixedFeedInPerDay: 0.28747 };
    expect(updateSettings({ tariff: t }).tariff).toEqual(t);
    expect(getSettings().tariff).toEqual(t);
  });
  it("coerces negative/non-numeric prices to null and unknown mode to simple", () => {
    const t = updateSettings({ tariff: { ...full, mode: "bogus" as unknown as "simple", importLow: -1 as number, importHigh: "x" as unknown as number } }).tariff;
    expect(t.mode).toBe("simple");
    expect(t.importLow).toBeNull();
    expect(t.importHigh).toBeNull();
  });
  it("upgrades an old simple tariff (no mode) to mode=simple, keeping prices", () => {
    const t = updateSettings({ tariff: { importPrice: 0.25, exportPrice: 0.1 } as unknown as typeof full }).tariff;
    expect(t.mode).toBe("simple");
    expect(t.importPrice).toBe(0.25);
    expect(t.exportPrice).toBe(0.1);
  });
});
