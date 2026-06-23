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
  // additional woonkamer scenes (shown in the "Alle scenes" modal)
  "scene.woonkamer_nachtlampje": "linear-gradient(150deg, #c98a5a, #6e4a36)",
  "scene.woonkamer_maartje_s_bloementuin": "linear-gradient(150deg, #ec8fb6, #86c08a)",
  "scene.woonkamer_arctische_dageraad": "linear-gradient(150deg, #8fb6e6, #7e6fb0)",
  "scene.woonkamer_aan_tafel_2": "linear-gradient(150deg, #f0b46a, #d98a3e)",
  "scene.woonkamer_energie": "linear-gradient(150deg, #5fc8e0, #3f8fd0)",
  "scene.woonkamer_tropische_schemering": "linear-gradient(150deg, #f08a5d, #b5547e)",
  "scene.woonkamer_rusten": "linear-gradient(150deg, #7f8db0, #4a5170)",
  "scene.woonkamer_vlammen": "linear-gradient(150deg, #f0653a, #b52a1e)",
  "scene.woonkamer_bas_nibbit_monster": "linear-gradient(150deg, #7fc05a, #5a5fb0)",
  "scene.woonkamer_concentreren": "linear-gradient(150deg, #9fc2e0, #5f86b0)",
  "scene.woonkamer_savannah_zon": "linear-gradient(150deg, #f0c05a, #d98a3e)",
  "scene.woonkamer_milan_kom_naar_bed": "linear-gradient(150deg, #c98a6a, #6e4a40)",
  "scene.woonkamer_kerstmis": "linear-gradient(150deg, #d9433a, #2f8f4a)",
  "scene.woonkamer_de_jongens": "linear-gradient(150deg, #5f9fd6, #3f6fb0)",
  "scene.woonkamer_leuke_familie": "linear-gradient(150deg, #f0a85a, #e07a8a)",
  "scene.woonkamer_natuurlijk_licht": "linear-gradient(150deg, #e6d2a8, #c2a878)",
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
