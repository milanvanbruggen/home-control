import { describe, it, expect } from "vitest";
import { defaultCardIds, orderCardIds } from "@/lib/home-cards";
import type { AppState } from "@/lib/types";

// Minimal structural fixture — defaultCardIds only reads rooms.length, thermostat
// truthiness, chill ids, metric room keys + visibility.
function state(partial: Record<string, unknown>): AppState {
  return { chills: [], thermostat: null, rooms: [], metrics: [], solar: { available: false, currentPowerW: null, netGridKw: null, gridDirection: "idle", coveragePct: null, lifetimeKwh: null }, ...partial } as unknown as AppState;
}

describe("defaultCardIds", () => {
  it("always lists solar first by default", () => {
    const s: AppState = {
      chills: [], thermostat: null, rooms: [], metrics: [],
      solar: { available: false, currentPowerW: null, netGridKw: null, gridDirection: "idle", coveragePct: null, lifetimeKwh: null },
    };
    expect(defaultCardIds(s)[0]).toBe("solar");
  });

  it("orders lights, thermostat, chills, then metric rooms with a visible metric", () => {
    const s = state({
      rooms: [{ key: "woonkamer" }],
      thermostat: { id: "climate.woonkamer_woonkamer" },
      chills: [{ id: "climate.zolder" }, { id: "climate.speelkamer" }],
      metrics: [
        { key: "woonkamer", name: "Woonkamer", metrics: [{ kind: "temperature", value: 1, unit: "°C", visible: true }] },
        { key: "hidden", name: "Hidden", metrics: [{ kind: "temperature", value: 1, unit: "°C", visible: false }] },
      ],
    });
    expect(defaultCardIds(s)).toEqual(["solar", "lights", "thermostat", "climate.zolder", "climate.speelkamer", "woonkamer"]);
  });

  it("returns only solar when there are no rooms, thermostat, chills, or visible metrics", () => {
    expect(defaultCardIds(state({}))).toEqual(["solar"]);
  });
});

describe("orderCardIds", () => {
  it("applies the saved order, drops stale ids, appends new cards in default order", () => {
    const def = ["lights", "thermostat", "a", "b"];
    expect(orderCardIds(def, ["b", "lights", "gone"])).toEqual(["b", "lights", "thermostat", "a"]);
  });

  it("returns the default order when nothing is saved", () => {
    expect(orderCardIds(["a", "b"], [])).toEqual(["a", "b"]);
  });
});
