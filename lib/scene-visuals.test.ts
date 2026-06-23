import { describe, it, expect } from "vitest";
import { sceneGradient } from "@/lib/scene-visuals";

describe("sceneGradient", () => {
  it("colors a known scene name from the curated keyword map", () => {
    expect(sceneGradient("scene.woonkamer_helder", "Helder")).toContain("#6fa9d6");
    // works even when the friendly name is room-prefixed
    expect(sceneGradient("scene.keuken_helder", "Keuken Helder")).toContain("#6fa9d6");
  });

  it("gives the same gradient for the same scene name across rooms", () => {
    expect(sceneGradient("scene.keuken_ontspannen", "Keuken Ontspannen")).toBe(
      sceneGradient("scene.werkkamer_ontspannen", "Werkkamer Ontspannen"),
    );
  });

  it("falls back to a deterministic, non-grey gradient for unknown names", () => {
    const g = sceneGradient("scene.woonkamer_de_jongens", "De jongens");
    expect(g).toMatch(/hsl\(/);
    expect(g).not.toContain("#6b7280"); // never the Uit/neutral grey
    expect(g).toBe(sceneGradient("scene.woonkamer_de_jongens", "De jongens")); // stable
  });

  it("keeps the 'Uit' function tile neutral grey", () => {
    expect(sceneGradient("woonkamer_uit", "Uit")).toContain("#6b7280");
    expect(sceneGradient("keuken_uit", "Uit")).toContain("#6b7280");
  });
});
