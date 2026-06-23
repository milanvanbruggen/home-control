// Visual color for each scene tile.
//
// HA does not expose Hue scene colors, so we color a tile by its scene NAME:
// the shared Hue scene names (Helder, Ontspannen, Lezen, …) repeat across rooms,
// so a keyword map gives consistent colors everywhere; an unknown name gets a
// stable hashed color (never grey). The per-room "Uit" function tile (id ending
// in "_uit") stays neutral grey.
//
// A real per-scene gradient map keyed by scene id (e.g. derived from colors
// fetched directly from the Hue bridge) can be injected via setSceneColors()
// and takes precedence — no component changes needed.
//   <-- Hue-bridge per-scene colors plug in here (call setSceneColors(map)).

const UIT_GRAY = "linear-gradient(150deg, #9aa3b2, #6b7280)";

// keyword (lowercase, matched by inclusion) -> gradient. Longer/more specific
// phrases come first so they win over a shorter substring.
const KEYWORD_GRADIENTS: ReadonlyArray<readonly [string, string]> = [
  ["pumpkin", "linear-gradient(150deg, #f0913f, #d9533a)"],
  ["aan tafel", "linear-gradient(150deg, #f0b46a, #d98a3e)"],
  ["arctische dageraad", "linear-gradient(150deg, #8fb6e6, #c8a0c8)"],
  ["tropische schemering", "linear-gradient(150deg, #f08a5d, #b5547e)"],
  ["natuurlijk licht", "linear-gradient(150deg, #e6d2a8, #c2a878)"],
  ["lentebloesem", "linear-gradient(150deg, #e985a8, #7fb87f)"],
  ["concentreren", "linear-gradient(150deg, #9fc2e0, #5f86b0)"],
  ["nachtlampje", "linear-gradient(150deg, #c98a5a, #6e4a36)"],
  ["ontspannen", "linear-gradient(150deg, #e8915a, #c75a3c)"],
  ["savann", "linear-gradient(150deg, #f0c05a, #d98a3e)"],
  ["energie", "linear-gradient(150deg, #5fc8e0, #3f8fd0)"],
  ["vlammen", "linear-gradient(150deg, #f0653a, #b52a1e)"],
  ["gedimd", "linear-gradient(150deg, #7c5a48, #4a382f)"],
  ["rusten", "linear-gradient(150deg, #7f8db0, #4a5170)"],
  ["lezen", "linear-gradient(150deg, #f0b25a, #c67f2e)"],
  ["helder", "linear-gradient(150deg, #6fa9d6, #3f7fb0)"],
  ["kerst", "linear-gradient(150deg, #d9433a, #2f8f4a)"],
];

let injected: Record<string, string> | null = null;

/** Inject real per-scene gradients keyed by scene id (e.g. from Hue-bridge colors). */
export function setSceneColors(map: Record<string, string>): void {
  injected = map;
}

/** A deterministic, colorful gradient for any name — so a real scene is never grey. */
function hashGradient(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  const hue = h % 360;
  return `linear-gradient(150deg, hsl(${hue} 66% 56%), hsl(${(hue + 26) % 360} 60% 46%))`;
}

/**
 * Gradient for a scene tile. `id` distinguishes the "Uit" function + injected
 * colors; `name` drives the curated/hashed color (shared across rooms).
 */
export function sceneGradient(id: string, name: string): string {
  if (injected?.[id]) return injected[id];
  if (id.endsWith("_uit")) return UIT_GRAY;
  const lower = name.toLowerCase();
  for (const [kw, g] of KEYWORD_GRADIENTS) if (lower.includes(kw)) return g;
  return hashGradient(name);
}
