// Pure helpers: turn Hue scene light states (xy or color-temperature) into a
// vivid CSS gradient, and a normalized key to match Hue scenes to HA scenes.

function norm(s: string): string {
  return s.toLowerCase().trim().replace(/\s+/g, " ");
}

/**
 * Normalized "<room>|<scene>" key. The HA scene name may carry a room prefix
 * (e.g. "Keuken Helder") while the Hue scene name is short ("Helder"); we strip
 * a leading room prefix so both sides produce the same key.
 */
export function sceneKey(roomName: string, sceneName: string): string {
  const r = norm(roomName);
  let s = norm(sceneName);
  if (s.startsWith(`${r} `)) s = s.slice(r.length + 1);
  return `${r}|${s}`;
}

function clamp(n: number, lo: number, hi: number): number {
  return n < lo ? lo : n > hi ? hi : n;
}

function toHex(r: number, g: number, b: number): string {
  const h = (v: number) => clamp(Math.round(v), 0, 255).toString(16).padStart(2, "0");
  return `#${h(r)}${h(g)}${h(b)}`;
}

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Philips Hue CIE xy → vivid sRGB hex (normalized to the brightest channel so
 *  tiles show the scene's hue clearly regardless of the stored dimming). */
export function xyBriToRgb(x: number, y: number, _bri = 100): string {
  const yy = y <= 0 ? 1e-6 : y;
  const Y = 1;
  const X = (Y / yy) * x;
  const Z = (Y / yy) * (1 - x - y);
  let r = X * 1.656492 - Y * 0.354851 - Z * 0.255038;
  let g = -X * 0.707196 + Y * 1.655397 + Z * 0.036152;
  let b = X * 0.051713 - Y * 0.121364 + Z * 1.01153;
  const gamma = (c: number) => {
    const v = Math.max(c, 0);
    return v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055;
  };
  r = gamma(r);
  g = gamma(g);
  b = gamma(b);
  const max = Math.max(r, g, b, 1e-6);
  return toHex((r / max) * 255, (g / max) * 255, (b / max) * 255);
}

/** Color temperature in mirek (1e6/Kelvin) → approximate sRGB hex (Tanner Helland). */
export function mirekToRgb(mirek: number): string {
  const kelvin = clamp(1e6 / Math.max(mirek, 1), 1000, 40000);
  const t = kelvin / 100;
  let r: number;
  let g: number;
  let b: number;
  if (t <= 66) {
    r = 255;
    g = clamp(99.4708025861 * Math.log(t) - 161.1195681661, 0, 255);
  } else {
    r = clamp(329.698727446 * (t - 60) ** -0.1332047592, 0, 255);
    g = clamp(288.1221695283 * (t - 60) ** -0.0755148492, 0, 255);
  }
  if (t >= 66) b = 255;
  else if (t <= 19) b = 0;
  else b = clamp(138.5177312231 * Math.log(t - 10) - 305.0447927307, 0, 255);
  return toHex(r, g, b);
}

function lighten(hex: string, amt: number): string {
  const [r, g, b] = hexToRgb(hex);
  return toHex(r + (255 - r) * amt, g + (255 - g) * amt, b + (255 - b) * amt);
}
function darken(hex: string, amt: number): string {
  const [r, g, b] = hexToRgb(hex);
  return toHex(r * (1 - amt), g * (1 - amt), b * (1 - amt));
}
function dist(a: string, b: string): number {
  const [r1, g1, b1] = hexToRgb(a);
  const [r2, g2, b2] = hexToRgb(b);
  return Math.abs(r1 - r2) + Math.abs(g1 - g2) + Math.abs(b1 - b2);
}

/** Build a CSS gradient from a scene's per-light hex colors (in scene order). */
export function actionsToGradient(colors: string[]): string {
  const distinct: string[] = [];
  for (const c of colors) if (!distinct.some((d) => dist(d, c) < 40)) distinct.push(c);
  if (distinct.length === 0) return "";
  let stops: string[];
  if (distinct.length === 1) stops = [lighten(distinct[0], 0.18), darken(distinct[0], 0.22)];
  else if (distinct.length <= 3) stops = distinct;
  else stops = [distinct[0], distinct[Math.floor(distinct.length / 2)], distinct[distinct.length - 1]];
  return `linear-gradient(135deg, ${stops.join(", ")})`;
}
