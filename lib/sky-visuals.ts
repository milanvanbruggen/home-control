import type { SkyCondition } from "@/lib/types";

export type SkyLayer = "sun" | "clouds" | "rain" | "snow" | "stars" | "moon";
export type SkyIconKey =
  | "sun" | "cloud-sun" | "cloud" | "cloud-fog"
  | "cloud-rain" | "cloud-lightning" | "cloud-snow" | "moon" | "cloud-moon";

export interface SkyVisual {
  key: string;
  gradient: string;
  layers: SkyLayer[];
  icon: SkyIconKey;
  cloudTone: "white" | "grey" | "dark";
}

type SkyDef = Omit<SkyVisual, "key">;
const A = "165deg";

const DAY: Record<SkyCondition, SkyDef> = {
  sunny:           { gradient: `linear-gradient(${A}, #2b86c5, #5bb4e6 52%, #f6cf6f)`, layers: ["sun"],                  icon: "sun",             cloudTone: "white" },
  "partly-cloudy": { gradient: `linear-gradient(${A}, #3a8ec7, #76b1d6 55%, #c2cfd9)`, layers: ["sun", "clouds"],        icon: "cloud-sun",       cloudTone: "white" },
  cloudy:          { gradient: `linear-gradient(${A}, #586a7e, #7e8d9e 55%, #a7b2bf)`, layers: ["clouds"],               icon: "cloud",           cloudTone: "grey"  },
  fog:             { gradient: `linear-gradient(${A}, #6b7884, #97a3ad 55%, #c2c9cf)`, layers: ["clouds"],               icon: "cloud-fog",       cloudTone: "grey"  },
  rain:            { gradient: `linear-gradient(${A}, #37475b, #4f6176 55%, #67798e)`, layers: ["clouds", "rain"],        icon: "cloud-rain",      cloudTone: "dark"  },
  pouring:         { gradient: `linear-gradient(${A}, #2c3a4c, #415367 55%, #566b80)`, layers: ["clouds", "rain"],        icon: "cloud-rain",      cloudTone: "dark"  },
  snow:            { gradient: `linear-gradient(${A}, #5f7796, #90a7c1 52%, #c5d4e2)`, layers: ["clouds", "snow"],        icon: "cloud-snow",      cloudTone: "white" },
  sleet:           { gradient: `linear-gradient(${A}, #4a5e74, #71869c 55%, #9fb1c2)`, layers: ["clouds", "rain", "snow"], icon: "cloud-snow",     cloudTone: "grey"  },
  thunder:         { gradient: `linear-gradient(${A}, #2a2f45, #3c4565 55%, #586089)`, layers: ["clouds", "rain"],        icon: "cloud-lightning", cloudTone: "dark"  },
  unknown:         { gradient: `linear-gradient(${A}, #5b6b80, #8492a3 60%, #aab6c4)`, layers: [],                        icon: "cloud",           cloudTone: "grey"  },
};

const NIGHT: Record<SkyCondition, SkyDef> = {
  sunny:           { gradient: `linear-gradient(${A}, #0e1733, #1b2a54 52%, #2b3a64)`, layers: ["moon", "stars"],         icon: "moon",            cloudTone: "dark" },
  "partly-cloudy": { gradient: `linear-gradient(${A}, #141d33, #232f48 55%, #36425e)`, layers: ["clouds", "stars"],       icon: "cloud-moon",      cloudTone: "dark" },
  cloudy:          { gradient: `linear-gradient(${A}, #161d2e, #27303f 55%, #3a4453)`, layers: ["clouds"],                icon: "cloud",           cloudTone: "dark" },
  fog:             { gradient: `linear-gradient(${A}, #1a212e, #2b333f 55%, #3d4753)`, layers: ["clouds"],                icon: "cloud-fog",       cloudTone: "dark" },
  rain:            { gradient: `linear-gradient(${A}, #1e2733, #2c3947 55%, #3a4856)`, layers: ["clouds", "rain"],        icon: "cloud-rain",      cloudTone: "dark" },
  pouring:         { gradient: `linear-gradient(${A}, #18202b, #25313d 55%, #33414f)`, layers: ["clouds", "rain"],        icon: "cloud-rain",      cloudTone: "dark" },
  snow:            { gradient: `linear-gradient(${A}, #27344a, #3a4a63 55%, #56688a)`, layers: ["clouds", "snow"],        icon: "cloud-snow",      cloudTone: "white" },
  sleet:           { gradient: `linear-gradient(${A}, #222e40, #344357 55%, #4a5c78)`, layers: ["clouds", "rain", "snow"], icon: "cloud-snow",     cloudTone: "dark" },
  thunder:         { gradient: `linear-gradient(${A}, #191d2e, #262c44 55%, #3a4060)`, layers: ["clouds", "rain"],        icon: "cloud-lightning", cloudTone: "dark" },
  unknown:         { gradient: `linear-gradient(${A}, #161d2e, #2a3344 60%, #3a4453)`, layers: [],                        icon: "moon",            cloudTone: "dark" },
};

/** Resolve a normalized sky condition into the gradient + animation layers to render.
 *  `coverage` is accepted for future tuning but unused in v1 (condition drives everything). */
export function resolveSkyVisual(condition: SkyCondition, isDay: boolean, coverage: number | null = null): SkyVisual {
  void coverage;
  const table = isDay ? DAY : NIGHT;
  const def = table[condition] ?? table.unknown;
  return { key: `${condition}-${isDay ? "day" : "night"}`, ...def };
}
