import { describe, it, expect } from "vitest";
import { absoluteHumidity, dewPoint, roomComfort } from "@/lib/psychrometrics";

describe("psychrometrics", () => {
  it("matches the reference point 20C/50%", () => {
    expect(absoluteHumidity(20, 50)).toBeCloseTo(7.24, 1);
    expect(dewPoint(20, 50)).toBeCloseTo(9.26, 1);
  });
  it("classifies comfort status", () => {
    expect(roomComfort(20, 84).status).toBe("condensation"); // T-Td < 3
    expect(roomComfort(21, 70).status).toBe("humid");
    expect(roomComfort(21, 30).status).toBe("dry");
    expect(roomComfort(21.5, 52).status).toBe("comfortable");
  });
  it("returns the derived numbers on the comfort object", () => {
    const c = roomComfort(20, 50);
    expect(c.dewPoint).toBeCloseTo(9.26, 1);
    expect(c.absHumidity).toBeCloseTo(7.24, 1);
  });
});
