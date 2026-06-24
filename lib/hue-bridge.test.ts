import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { buildGradientMap, getSceneGradients, _setHueFetcher, _resetHueCache } from "@/lib/hue-bridge";

const rooms = { data: [{ id: "room1", metadata: { name: "Woonkamer" } }] };
const scenes = {
  data: [
    {
      metadata: { name: "Ontspannen" },
      group: { rid: "room1" },
      actions: [{ action: { on: { on: true }, color_temperature: { mirek: 447 }, dimming: { brightness: 50 } } }],
    },
    {
      metadata: { name: "Kleurig" },
      group: { rid: "room1" },
      actions: [
        { action: { on: { on: true }, color: { xy: { x: 0.6, y: 0.3 } } } },
        { action: { on: { on: true }, color: { xy: { x: 0.15, y: 0.06 } } } },
      ],
    },
  ],
};

describe("buildGradientMap", () => {
  it("keys scenes by normalized room|name with a gradient", () => {
    const m = buildGradientMap(rooms, scenes);
    expect(m["woonkamer|ontspannen"]).toMatch(/^linear-gradient\(135deg/);
    expect(m["woonkamer|kleurig"]).toMatch(/^linear-gradient\(135deg/);
  });
  it("ignores scenes whose room is unknown", () => {
    const m = buildGradientMap(rooms, {
      data: [{ metadata: { name: "X" }, group: { rid: "nope" }, actions: [] }],
    });
    expect(Object.keys(m)).toHaveLength(0);
  });
});

describe("getSceneGradients", () => {
  const origIp = process.env.HUE_BRIDGE_IP;
  const origKey = process.env.HUE_APP_KEY;
  beforeEach(() => _resetHueCache());
  afterEach(() => {
    _setHueFetcher(null);
    _resetHueCache();
    if (origIp === undefined) delete process.env.HUE_BRIDGE_IP;
    else process.env.HUE_BRIDGE_IP = origIp;
    if (origKey === undefined) delete process.env.HUE_APP_KEY;
    else process.env.HUE_APP_KEY = origKey;
  });

  it("returns {} when bridge env is missing", async () => {
    delete process.env.HUE_BRIDGE_IP;
    delete process.env.HUE_APP_KEY;
    expect(await getSceneGradients()).toEqual({});
  });

  it("fetches once and serves the cache within the TTL", async () => {
    process.env.HUE_BRIDGE_IP = "1.2.3.4";
    process.env.HUE_APP_KEY = "k";
    let calls = 0;
    _setHueFetcher(async (_host, pathname) => {
      calls++;
      return pathname.includes("room") ? rooms : scenes;
    });
    const m = await getSceneGradients();
    expect(m["woonkamer|ontspannen"]).toMatch(/^linear-gradient/);
    await getSceneGradients();
    expect(calls).toBe(2); // room + scene fetched once; not refetched within TTL
  });

  it("returns {} when the bridge fetch fails", async () => {
    process.env.HUE_BRIDGE_IP = "1.2.3.4";
    process.env.HUE_APP_KEY = "k";
    _setHueFetcher(async () => {
      throw new Error("bridge down");
    });
    expect(await getSceneGradients()).toEqual({});
  });
});
