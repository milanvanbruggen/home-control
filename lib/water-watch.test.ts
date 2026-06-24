import { describe, it, expect } from "vitest";
import { roomsNewlyWarning } from "@/lib/water-watch";

describe("roomsNewlyWarning", () => {
  it("reports only off→on transitions", () => {
    expect(roomsNewlyWarning({ a: false, b: false }, { a: true, b: false })).toEqual(["a"]);
  });

  it("does not re-report a sensor that stays on", () => {
    expect(roomsNewlyWarning({ a: true }, { a: true })).toEqual([]);
  });

  it("resets on on→off so a later off→on fires again", () => {
    expect(roomsNewlyWarning({ a: true }, { a: false })).toEqual([]);
    expect(roomsNewlyWarning({ a: false }, { a: true })).toEqual(["a"]);
  });

  it("treats an unknown previous state as not-warning", () => {
    expect(roomsNewlyWarning({}, { a: true })).toEqual(["a"]);
  });
});
