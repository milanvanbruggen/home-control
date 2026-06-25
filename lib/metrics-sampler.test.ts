import { describe, it, expect } from "vitest";
import { sampleFromStates } from "@/lib/metrics-sampler";
import type { HaEntityState } from "@/lib/types";

const NOW = 1_700_000_000_000;

describe("sampleFromStates", () => {
  it("builds `${roomKey}.${kind}` keys with numeric values, null for unavailable/missing", () => {
    const states: HaEntityState[] = [
      { entity_id: "sensor.woonkamer_woonkamer_temperature", state: "21.4", attributes: {} },
      { entity_id: "sensor.woonkamer_woonkamer_humidity", state: "unavailable", attributes: {} },
    ];
    const sample = sampleFromStates(states, NOW);
    expect(sample.t).toBe(NOW);
    expect(sample.v["woonkamer.temperature"]).toBe(21.4);
    expect(sample.v["woonkamer.humidity"]).toBeNull();
    // a configured sensor with no matching state is present and null
    expect(sample.v["zolder.temperature"]).toBeNull();
    // keys exist for every configured room/sensor
    expect(Object.keys(sample.v)).toContain("buiten.temperature");
  });
});
