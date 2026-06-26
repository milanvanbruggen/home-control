import { describe, it, expect } from "vitest";
import { formatMetricValue, numericState, METRIC_UNIT_FALLBACK, metricCardSpan, wattsToKw, formatKw, formatKwh, formatPercent, formatEuro } from "@/lib/metrics";
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

describe("metricCardSpan", () => {
  it("is full-width with 2+ visible metrics, half-width with 1", () => {
    expect(metricCardSpan(2)).toBe("col-span-2");
    expect(metricCardSpan(1)).toBe("col-span-1");
    expect(metricCardSpan(3)).toBe("col-span-2");
  });
});

describe("solar formatters", () => {
  it("wattsToKw converts and rounds to 2 decimals, null passes through", () => {
    expect(wattsToKw(3240)).toBe(3.24);
    expect(wattsToKw(null)).toBeNull();
  });
  it("formatKw uses a NL comma, em-dash for null", () => {
    expect(formatKw(3.24)).toBe("3,24");
    expect(formatKw(0)).toBe("0,00");
    expect(formatKw(null)).toBe("—");
  });
  it("formatKwh uses one decimal NL comma", () => {
    expect(formatKwh(18.4)).toBe("18,4");
    expect(formatKwh(null)).toBe("—");
  });
  it("formatPercent rounds, em-dash for null", () => {
    expect(formatPercent(99.6)).toBe("100");
    expect(formatPercent(null)).toBe("—");
  });
});

describe("formatEuro", () => {
  it("formats euros with a NL comma and two decimals", () => {
    expect(formatEuro(4.1)).toBe("€ 4,10");
    expect(formatEuro(0)).toBe("€ 0,00");
  });
  it("returns an em dash for null", () => {
    expect(formatEuro(null)).toBe("—");
  });
});
