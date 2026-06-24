import { describe, it, expect } from "vitest";
import { xyBriToRgb, mirekToRgb, actionsToGradient, sceneKey } from "@/lib/hue-color";

const hex = /^#[0-9a-f]{6}$/;
const ch = (h: string, i: number) => parseInt(h.slice(1 + i * 2, 3 + i * 2), 16);
const count = (g: string) => (g.match(/#[0-9a-f]{6}/g) ?? []).length;

describe("xyBriToRgb", () => {
  it("a red xy point is red-dominant", () => {
    const c = xyBriToRgb(0.675, 0.322);
    expect(c).toMatch(hex);
    expect(ch(c, 0)).toBeGreaterThan(ch(c, 1));
    expect(ch(c, 0)).toBeGreaterThan(ch(c, 2));
  });
  it("a blue xy point is blue-dominant", () => {
    const c = xyBriToRgb(0.167, 0.04);
    expect(ch(c, 2)).toBeGreaterThan(ch(c, 0));
  });
});

describe("mirekToRgb", () => {
  it("warm (high mirek) is reddish, cool (low mirek) has more blue", () => {
    const warm = mirekToRgb(447); // ~2240K
    const cool = mirekToRgb(153); // ~6500K
    expect(warm).toMatch(hex);
    expect(ch(warm, 0)).toBeGreaterThanOrEqual(ch(warm, 2)); // warm: red >= blue
    expect(ch(cool, 2)).toBeGreaterThan(ch(warm, 2)); // cool bluer than warm
  });
});

describe("actionsToGradient", () => {
  it("empty → empty string", () => {
    expect(actionsToGradient([])).toBe("");
  });
  it("single color → a two-stop gradient", () => {
    const g = actionsToGradient(["#f0913f"]);
    expect(g).toMatch(/^linear-gradient\(135deg, /);
    expect(count(g)).toBe(2);
  });
  it("two distinct colors are kept as-is", () => {
    expect(actionsToGradient(["#ff0000", "#00ff00"])).toBe("linear-gradient(135deg, #ff0000, #00ff00)");
  });
  it("near-identical colors collapse to one (two-stop)", () => {
    expect(count(actionsToGradient(["#112233", "#112234", "#112235"]))).toBe(2);
  });
  it(">3 distinct colors → 3 stops", () => {
    expect(count(actionsToGradient(["#ff0000", "#00ff00", "#0000ff", "#ffff00"]))).toBe(3);
  });
});

describe("sceneKey", () => {
  it("normalizes + strips a leading room prefix", () => {
    expect(sceneKey("Woonkamer", "Ontspannen")).toBe("woonkamer|ontspannen");
    expect(sceneKey("Keuken", "Keuken Helder")).toBe("keuken|helder");
    expect(sceneKey("  Slaapkamer   Bas ", "Energie")).toBe("slaapkamer bas|energie");
  });
});
