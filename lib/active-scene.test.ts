import { describe, it, expect, beforeEach } from "vitest";
import { getActiveScene, setActiveScene, clearActiveScene } from "@/lib/active-scene";

describe("active-scene", () => {
  beforeEach(() => clearActiveScene());

  it("starts as null", () => {
    expect(getActiveScene()).toBeNull();
  });

  it("remembers the scene that was set", () => {
    setActiveScene("scene.woonkamer_lezen");
    expect(getActiveScene()).toBe("scene.woonkamer_lezen");
  });

  it("clears back to null", () => {
    setActiveScene("scene.woonkamer_lezen");
    clearActiveScene();
    expect(getActiveScene()).toBeNull();
  });
});
