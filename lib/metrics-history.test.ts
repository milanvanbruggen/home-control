import { describe, it, expect } from "vitest";
import { appendAndPrune, windowAndDownsample, RETENTION_MS, RANGE_MS } from "@/lib/metrics-history";
import type { MetricHistory } from "@/lib/metrics-history";

const NOW = 1_700_000_000_000;

describe("appendAndPrune", () => {
  it("appends a sample and drops anything older than 30 days", () => {
    const old = { t: NOW - RETENTION_MS - 1, v: { "a.temperature": 1 } };
    const recent = { t: NOW - 1000, v: { "a.temperature": 2 } };
    const next = appendAndPrune({ samples: [old, recent] }, { t: NOW, v: { "a.temperature": 3 } }, NOW);
    expect(next.samples.map((s) => s.t)).toEqual([recent.t, NOW]);
  });
});

describe("windowAndDownsample", () => {
  const samples: MetricHistory["samples"] = [
    { t: NOW - 3000, v: { "a.temperature": 10 } },
    { t: NOW - 2000, v: { "a.temperature": 20 } },
    { t: NOW - 1000, v: { "a.temperature": null } },
    { t: NOW - 10 * 60 * 60 * 1000, v: { "a.temperature": 99 } }, // 10h ago, outside a 1h window
  ];

  it("returns raw points within the window when under maxPoints", () => {
    const from = NOW - 60 * 60 * 1000; // 1h
    const pts = windowAndDownsample(samples, "a.temperature", from, NOW, 48);
    expect(pts).toEqual([
      { t: NOW - 3000, value: 10 },
      { t: NOW - 2000, value: 20 },
      { t: NOW - 1000, value: null },
    ]);
  });

  it("uses null when the key is missing in a sample", () => {
    const pts = windowAndDownsample([{ t: NOW - 1000, v: { "b.humidity": 5 } }], "a.temperature", NOW - 5000, NOW, 48);
    expect(pts).toEqual([{ t: NOW - 1000, value: null }]);
  });

  it("downsamples to maxPoints buckets, averaging non-null values", () => {
    const from = NOW - 10_000;
    const many = Array.from({ length: 100 }, (_, i) => ({ t: from + i * 100, v: { "a.temperature": i } }));
    const pts = windowAndDownsample(many, "a.temperature", from, NOW, 10);
    expect(pts).toHaveLength(10);
    expect(pts.every((p) => p.value !== null)).toBe(true);
    expect(pts[0].value).toBeLessThan(pts[9].value!); // increasing buckets
  });
});
