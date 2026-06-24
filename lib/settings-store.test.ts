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
    expect(getSettings()).toEqual({ language: "en", theme: "system", favorites: {} });
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
});
