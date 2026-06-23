import { describe, it, expect, beforeEach } from "vitest";
import { getActiveScene, setActiveScene, clearActiveScene } from "@/lib/active-scene";

describe("active-scene (per room)", () => {
  beforeEach(() => clearActiveScene());

  it("starts as null per room", () => {
    expect(getActiveScene("woonkamer")).toBeNull();
  });

  it("remembers the scene per room independently", () => {
    setActiveScene("woonkamer", "scene.woonkamer_lezen");
    setActiveScene("keuken", "scene.keuken_helder");
    expect(getActiveScene("woonkamer")).toBe("scene.woonkamer_lezen");
    expect(getActiveScene("keuken")).toBe("scene.keuken_helder");
  });

  it("clears one room without touching another", () => {
    setActiveScene("woonkamer", "scene.woonkamer_lezen");
    setActiveScene("keuken", "scene.keuken_helder");
    clearActiveScene("woonkamer");
    expect(getActiveScene("woonkamer")).toBeNull();
    expect(getActiveScene("keuken")).toBe("scene.keuken_helder");
  });

  it("clears all rooms when called without a key", () => {
    setActiveScene("woonkamer", "scene.x");
    setActiveScene("keuken", "scene.y");
    clearActiveScene();
    expect(getActiveScene("woonkamer")).toBeNull();
    expect(getActiveScene("keuken")).toBeNull();
  });
});
