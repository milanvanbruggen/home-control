import type { RoomComfort } from "@/lib/types";

const P_HPA = 1013;

/** Saturation vapour pressure (Magnus, hPa). */
export function saturationVaporPressure(T: number): number {
  return 6.112 * Math.exp((17.62 * T) / (243.12 + T));
}

/** Absolute humidity / mixing ratio (g water per kg dry air). */
export function absoluteHumidity(T: number, RH: number): number {
  const e = (RH / 100) * saturationVaporPressure(T);
  return (621.97 * e) / (P_HPA - e);
}

/** Dew point temperature (°C). */
export function dewPoint(T: number, RH: number): number {
  const a = Math.log(RH / 100) + (17.62 * T) / (243.12 + T);
  return (243.12 * a) / (17.62 - a);
}

/** Derived comfort/condensation summary for a room from its temp (°C) + RH (%). */
export function roomComfort(T: number, RH: number): RoomComfort {
  const td = dewPoint(T, RH);
  const status =
    T - td < 3 ? "condensation"
    : RH > 65 ? "humid"
    : RH < 35 ? "dry"
    : "comfortable";
  return { dewPoint: td, absHumidity: absoluteHumidity(T, RH), status };
}
