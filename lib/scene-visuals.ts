// Visual color for each Hue scene tile.
//
// Home Assistant does not expose the Hue scene artwork or its colors, so these
// are curated gradients chosen to match each scene's character. They are
// SWAPPABLE: inject a real per-scene gradient map (e.g. derived from colors
// fetched directly from the Hue bridge) via setSceneColors() and it takes
// precedence over the curated defaults — no component changes needed.
//   <-- Hue-bridge per-scene colors plug in here (call setSceneColors(map)).

const CURATED: Record<string, string> = {
  "scene.woonkamer_pumpkin_spice": "linear-gradient(150deg, #f0913f, #d9533a)",
  "scene.woonkamer_ontspannen": "linear-gradient(150deg, #e8915a, #c75a3c)",
  "scene.woonkamer_aan_tafel": "linear-gradient(150deg, #f0b46a, #d98a3e)",
  "scene.woonkamer_gedimd": "linear-gradient(150deg, #7c5a48, #4a382f)",
  "scene.woonkamer_lezen": "linear-gradient(150deg, #f0b25a, #c67f2e)",
  "scene.woonkamer_lentebloesem": "linear-gradient(150deg, #e985a8, #7fb87f)",
  "scene.woonkamer_helder": "linear-gradient(150deg, #6fa9d6, #3f7fb0)",
  woonkamer_uit: "linear-gradient(150deg, #9aa3b2, #6b7280)",
};

const DEFAULT = "linear-gradient(150deg, #8a93a6, #6b7280)";

let injected: Record<string, string> | null = null;

/** Inject real per-scene gradients (e.g. derived from Hue-bridge colors). */
export function setSceneColors(map: Record<string, string>): void {
  injected = map;
}

export function sceneGradient(id: string): string {
  return injected?.[id] ?? CURATED[id] ?? DEFAULT;
}
