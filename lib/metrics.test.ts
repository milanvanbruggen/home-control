import { describe, it, expect } from "vitest";
import { formatMetricValue } from "@/lib/metrics";

describe("formatMetricValue", () => {
  it("formats temperature with one decimal and a comma", () => {
    expect(formatMetricValue({ kind: "temperature", value: 21.4, unit: "°C", visible: true })).toBe("21,4°C");
    expect(formatMetricValue({ kind: "temperature", value: 19, unit: "°C", visible: true })).toBe("19,0°C");
  });

  it("formats humidity as a rounded integer", () => {
    expect(formatMetricValue({ kind: "humidity", value: 48.6, unit: "%", visible: true })).toBe("49%");
  });

  it("returns an em dash for a null value", () => {
    expect(formatMetricValue({ kind: "temperature", value: null, unit: "°C", visible: true })).toBe("—");
  });
});
