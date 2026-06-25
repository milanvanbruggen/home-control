import { describe, it, expect } from "vitest";
import { formatMetricValue, numericState, METRIC_UNIT_FALLBACK } from "@/lib/metrics";
import type { HaEntityState } from "@/lib/types";

function ent(state: string, attrs: Record<string, unknown> = {}): HaEntityState {
  return { entity_id: "sensor.x", state, attributes: attrs };
}

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

describe("numericState", () => {
  it("parses a numeric state", () => {
    expect(numericState(ent("21.4"))).toBe(21.4);
    expect(numericState(ent("48"))).toBe(48);
  });
  it("returns null for unavailable/unknown/missing/non-numeric", () => {
    expect(numericState(ent("unavailable"))).toBeNull();
    expect(numericState(ent("unknown"))).toBeNull();
    expect(numericState(undefined)).toBeNull();
    expect(numericState(ent("warm"))).toBeNull();
  });
});

describe("METRIC_UNIT_FALLBACK", () => {
  it("maps kinds to default units", () => {
    expect(METRIC_UNIT_FALLBACK).toEqual({ temperature: "°C", humidity: "%" });
  });
});
