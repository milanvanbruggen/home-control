import { describe, it, expect, beforeEach } from "vitest";
import { getLastChillMode, setLastChillMode, clearLastChillMode } from "@/lib/chill-mode";

describe("chill-mode store", () => {
  beforeEach(() => clearLastChillMode());

  it("returns null for an unseen chill", () => {
    expect(getLastChillMode("climate.zolder")).toBeNull();
  });

  it("remembers the last mode per chill", () => {
    setLastChillMode("climate.zolder", "heat");
    setLastChillMode("climate.speelkamer", "cool");
    expect(getLastChillMode("climate.zolder")).toBe("heat");
    expect(getLastChillMode("climate.speelkamer")).toBe("cool");
  });

  it("overwrites with the newest mode", () => {
    setLastChillMode("climate.zolder", "cool");
    setLastChillMode("climate.zolder", "heat");
    expect(getLastChillMode("climate.zolder")).toBe("heat");
  });

  it("clears one chill or all", () => {
    setLastChillMode("a", "cool");
    setLastChillMode("b", "heat");
    clearLastChillMode("a");
    expect(getLastChillMode("a")).toBeNull();
    expect(getLastChillMode("b")).toBe("heat");
    clearLastChillMode();
    expect(getLastChillMode("b")).toBeNull();
  });
});
