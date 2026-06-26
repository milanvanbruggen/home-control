import fs from "node:fs";
import path from "node:path";
import { ROOMS, METRIC_KINDS, METRIC_ROOM_KEYS } from "@/config/devices";
import type { AppSettings, Theme, Language, TariffMode } from "@/lib/types";

// Server-only: persists app settings as JSON on the HA add-on's writable volume
// (/data), falling back to a project-local .data dir in development.

const LANGUAGES: readonly Language[] = ["en", "nl"];
const THEMES: readonly Theme[] = ["light", "dark", "system"];
const TARIFF_MODES: readonly TariffMode[] = ["simple", "advanced"];
const ROOM_KEYS = new Set(ROOMS.map((r) => r.key));

function validPrice(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : null;
}

function defaults(): AppSettings {
  return { language: "en", theme: "system", favorites: {}, waterAlert: true, hiddenMetrics: {}, cardOrder: [], tariff: { mode: "simple", importPrice: null, exportPrice: null, importLow: null, importHigh: null, feedInPrice: null, fixedFeedInPerDay: null } };
}

function resolvePath(): string {
  if (process.env.SETTINGS_PATH) return process.env.SETTINGS_PATH;
  try {
    fs.accessSync("/data", fs.constants.W_OK);
    return "/data/settings.json";
  } catch {
    return path.join(process.cwd(), ".data", "settings.json");
  }
}

/** Coerce arbitrary JSON into a valid AppSettings, dropping unknown/invalid fields. */
function sanitize(raw: unknown): AppSettings {
  const out = defaults();
  if (!raw || typeof raw !== "object") return out;
  const r = raw as Record<string, unknown>;
  if (typeof r.language === "string" && (LANGUAGES as readonly string[]).includes(r.language)) {
    out.language = r.language as Language;
  }
  if (typeof r.theme === "string" && (THEMES as readonly string[]).includes(r.theme)) {
    out.theme = r.theme as Theme;
  }
  if (r.favorites && typeof r.favorites === "object" && !Array.isArray(r.favorites)) {
    for (const [key, value] of Object.entries(r.favorites as Record<string, unknown>)) {
      if (ROOM_KEYS.has(key) && Array.isArray(value)) {
        out.favorites[key] = value.filter(
          (x): x is string => typeof x === "string" && x.startsWith("scene."),
        );
      }
    }
  }
  if (typeof r.waterAlert === "boolean") out.waterAlert = r.waterAlert;
  if (Array.isArray(r.cardOrder)) {
    out.cardOrder = r.cardOrder.filter((x): x is string => typeof x === "string");
  }
  if (r.hiddenMetrics && typeof r.hiddenMetrics === "object" && !Array.isArray(r.hiddenMetrics)) {
    for (const [key, value] of Object.entries(r.hiddenMetrics as Record<string, unknown>)) {
      if (METRIC_ROOM_KEYS.has(key) && Array.isArray(value)) {
        const kinds = value.filter(
          (x): x is string => typeof x === "string" && (METRIC_KINDS as readonly string[]).includes(x),
        );
        if (kinds.length) out.hiddenMetrics[key] = kinds;
      }
    }
  }
  if (r.tariff && typeof r.tariff === "object" && !Array.isArray(r.tariff)) {
    const tr = r.tariff as Record<string, unknown>;
    out.tariff = {
      mode: typeof tr.mode === "string" && (TARIFF_MODES as readonly string[]).includes(tr.mode) ? (tr.mode as TariffMode) : "simple",
      importPrice: validPrice(tr.importPrice),
      exportPrice: validPrice(tr.exportPrice),
      importLow: validPrice(tr.importLow),
      importHigh: validPrice(tr.importHigh),
      feedInPrice: validPrice(tr.feedInPrice),
      fixedFeedInPerDay: validPrice(tr.fixedFeedInPerDay),
    };
  }
  return out;
}

export function getSettings(): AppSettings {
  // Always read from disk. An in-memory cache went stale across module instances
  // (the API route and the RSC layout each hold their own), which made theme/
  // language appear "not saved" after a reload. The file is tiny.
  try {
    return sanitize(JSON.parse(fs.readFileSync(resolvePath(), "utf8")));
  } catch {
    return defaults();
  }
}

export function updateSettings(patch: Partial<AppSettings>): AppSettings {
  const current = getSettings();
  const merged = sanitize({
    language: patch.language ?? current.language,
    theme: patch.theme ?? current.theme,
    favorites: patch.favorites ?? current.favorites,
    waterAlert: patch.waterAlert ?? current.waterAlert,
    hiddenMetrics: patch.hiddenMetrics ?? current.hiddenMetrics,
    cardOrder: patch.cardOrder ?? current.cardOrder,
    tariff: patch.tariff ?? current.tariff,
  });
  const file = resolvePath();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(merged, null, 2), "utf8");
  fs.renameSync(tmp, file);
  return merged;
}

/** Test helper: kept for compatibility — reads always hit disk now. */
export function _resetSettingsCache(): void {}
