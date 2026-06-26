import { describe, it, expect } from "vitest";
import {
  parseHistory, downsamplePower, sumKwh, dayBoundaries, monthBoundaries,
} from "@/lib/solar-history";


describe("parseHistory", () => {
  it("parses numeric states to sorted {t,v} and drops non-numeric", () => {
    const out = parseHistory([
      { state: "100", last_changed: "2026-06-25T09:00:00Z" },
      { state: "unavailable", last_changed: "2026-06-25T09:30:00Z" },
      { state: "200", last_changed: "2026-06-25T10:00:00Z" },
    ]);
    expect(out).toEqual([
      { t: Date.parse("2026-06-25T09:00:00Z"), v: 100 },
      { t: Date.parse("2026-06-25T10:00:00Z"), v: 200 },
    ]);
  });
});

describe("downsamplePower", () => {
  it("returns points unchanged when within maxPoints", () => {
    const pts = [{ t: 10, v: 1 }, { t: 20, v: 2 }];
    expect(downsamplePower(pts, 0, 30, 48)).toEqual([
      { t: 10, value: 1 }, { t: 20, value: 2 },
    ]);
  });
  it("buckets and averages when above maxPoints", () => {
    const pts = [{ t: 0, v: 0 }, { t: 1, v: 10 }, { t: 9, v: 20 }, { t: 10, v: 30 }];
    const out = downsamplePower(pts, 0, 10, 2);
    expect(out).toHaveLength(2);
    expect(out[0].value).toBe(5);   // avg(0,10)
    expect(out[1].value).toBe(25);  // avg(20,30)
  });
});


describe("sumKwh", () => {
  it("sums non-null values, null when all empty", () => {
    expect(sumKwh([{ t: 0, value: 3 }, { t: 1, value: null }, { t: 2, value: 5 }])).toBe(8);
    expect(sumKwh([{ t: 0, value: null }])).toBeNull();
  });
});


describe("boundaries", () => {
  it("dayBoundaries(now,1) is [startOfDayUTC, now]", () => {
    const now = Date.parse("2026-06-25T13:30:00Z");
    expect(dayBoundaries(now, 1)).toEqual([Date.parse("2026-06-25T00:00:00Z"), now]);
  });
  it("dayBoundaries(now,7) has 8 ascending edges ending at now", () => {
    const now = Date.parse("2026-06-25T13:30:00Z");
    const b = dayBoundaries(now, 7);
    expect(b).toHaveLength(8);
    expect(b[b.length - 1]).toBe(now);
    expect(b[0]).toBe(Date.parse("2026-06-19T00:00:00Z"));
  });
  it("monthBoundaries(now,12) starts 11 months back on the 1st", () => {
    const now = Date.parse("2026-06-25T13:30:00Z");
    const b = monthBoundaries(now, 12);
    expect(b).toHaveLength(13);
    expect(b[0]).toBe(Date.UTC(2025, 6, 1)); // jul 2025
    expect(b[b.length - 1]).toBe(now);
  });
});
