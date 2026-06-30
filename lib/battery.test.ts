import { describe, it, expect } from "vitest";
import { batteryLevel } from "@/lib/battery";

describe("batteryLevel", () => {
  it("maps % to an icon level", () => {
    expect(batteryLevel(100).level).toBe("full");
    expect(batteryLevel(60).level).toBe("full");
    expect(batteryLevel(59).level).toBe("medium");
    expect(batteryLevel(30).level).toBe("medium");
    expect(batteryLevel(29).level).toBe("low");
    expect(batteryLevel(10).level).toBe("low");
    expect(batteryLevel(9).level).toBe("warning");
    expect(batteryLevel(0).level).toBe("warning");
  });
  it("flags low (red) under 20%", () => {
    expect(batteryLevel(20).low).toBe(false);
    expect(batteryLevel(19).low).toBe(true);
    expect(batteryLevel(5).low).toBe(true);
  });
});
