import type { Language } from "@/lib/types";

// English is the source/default language; nl mirrors every key (enforced by the type below).
const en = {
  "app.welcome": "Welcome home",
  "app.title": "Home control",
  "app.description": "Control the lighting and climate during your visit",
  "app.loading": "Loading",
  "connection.lost": "Lost connection to the house — retrying…",

  "lights.section": "Lighting",
  "lights.switchRoom": "Switch room (now {room})",
  "lights.allScenes": "All scenes",
  "lights.allScenesTitle": "All scenes — {room}",
  "lights.brightness": "Brightness",
  "lights.allLightsOff": "All lights off",
  "lights.wholeHouse": "whole house",
  "lights.noRooms": "No rooms available.",

  "climate.now": "now",
  "climate.saving": "Saving…",
  "climate.power": "on/off",
  "common.off": "Off",

  "chill.cool": "Cool",
  "chill.heat": "Heat",
  "chill.water": "Empty water tank",
  "chill.statusWorking": "Working",
  "chill.statusStarting": "Starting",
  "chill.statusCapacity": "Waiting for capacity",

  "fan.low": "Low",
  "fan.normal": "Normal",
  "fan.high": "High",

  "thermostat.heating": "Heating",
  "thermostat.cooling": "Cooling",
  "thermostat.idle": "Idle",

  "settings.title": "Settings",
  "settings.open": "Settings",
  "settings.back": "Back",
  "settings.language": "Language",
  "settings.theme": "Theme",
  "settings.themeLight": "Light",
  "settings.themeDark": "Dark",
  "settings.themeSystem": "System",
  "settings.favorites": "Favorite scenes",
  "settings.favoritesHint": "Pick which scenes appear in each room's quick grid.",
  "settings.widgets": "Widgets",
  "settings.widgetsHint": "Choose which readings to show per room.",
  "metric.temperature": "Temperature",
  "metric.humidity": "Humidity",
  "settings.saved": "Saved",
  "history.range24h": "24h",
  "history.range7d": "7d",
  "history.range30d": "30d",
  "history.collecting": "Collecting data…",

  "common.on": "On",
  "settings.notifications": "Notifications",
  "settings.waterAlert": "Water reservoir alert",
  "settings.waterAlertHint": "Show an alarm on the LaMetric when a Quatt reservoir needs emptying.",
  "settings.notifUnsupported": "Add the app to your home screen over HTTPS to enable notifications.",
  "settings.test": "Send test",
  "settings.saveError": "Couldn't save",
  "settings.testSent": "Test sent",
  "settings.testError": "Test failed",
  "settings.waterPushTitle": "Quatt water reservoir",
  "settings.waterPushBody": "The {room} reservoir needs emptying.",
  "settings.testPushBody": "Notifications are working.",
  "water.alert": "{room}: empty the water reservoir",
  "water.test": "Water alert test",
} as const;

export type MsgKey = keyof typeof en;

const nl: Record<MsgKey, string> = {
  "app.welcome": "Welkom thuis",
  "app.title": "Huisbediening",
  "app.description": "Bedien de verlichting en het klimaat tijdens je bezoek",
  "app.loading": "Laden",
  "connection.lost": "Verbinding met huis kwijt — opnieuw proberen…",

  "lights.section": "Verlichting",
  "lights.switchRoom": "Ruimte wisselen (nu {room})",
  "lights.allScenes": "Alle scenes",
  "lights.allScenesTitle": "Alle scenes — {room}",
  "lights.brightness": "Helderheid",
  "lights.allLightsOff": "Alle lampen uit",
  "lights.wholeHouse": "hele huis",
  "lights.noRooms": "Geen ruimtes beschikbaar.",

  "climate.now": "nu",
  "climate.saving": "Opslaan…",
  "climate.power": "aan/uit",
  "common.off": "Uit",

  "chill.cool": "Koelen",
  "chill.heat": "Verwarmen",
  "chill.water": "Waterreservoir legen",
  "chill.statusWorking": "Aan het werken",
  "chill.statusStarting": "Aan het starten",
  "chill.statusCapacity": "Wacht op capaciteit",

  "fan.low": "Laag",
  "fan.normal": "Normaal",
  "fan.high": "Hoog",

  "thermostat.heating": "Verwarmt",
  "thermostat.cooling": "Koelt",
  "thermostat.idle": "Inactief",

  "settings.title": "Instellingen",
  "settings.open": "Instellingen",
  "settings.back": "Terug",
  "settings.language": "Taal",
  "settings.theme": "Thema",
  "settings.themeLight": "Licht",
  "settings.themeDark": "Donker",
  "settings.themeSystem": "Systeem",
  "settings.favorites": "Favoriete scenes",
  "settings.favoritesHint": "Kies welke scenes in het snelkeuze-raster van elke kamer staan.",
  "settings.widgets": "Widgets",
  "settings.widgetsHint": "Kies welke meetwaarden je per kamer toont.",
  "metric.temperature": "Temperatuur",
  "metric.humidity": "Luchtvochtigheid",
  "settings.saved": "Opgeslagen",
  "history.range24h": "24u",
  "history.range7d": "7d",
  "history.range30d": "30d",
  "history.collecting": "Gegevens verzamelen…",

  "common.on": "Aan",
  "settings.notifications": "Meldingen",
  "settings.waterAlert": "Waterreservoir-melding",
  "settings.waterAlertHint": "Toon een alarm op de LaMetric als een Quatt-reservoir geleegd moet worden.",
  "settings.notifUnsupported": "Voeg de app via HTTPS toe aan je beginscherm om meldingen aan te zetten.",
  "settings.test": "Test sturen",
  "settings.saveError": "Opslaan mislukt",
  "settings.testSent": "Testmelding verstuurd",
  "settings.testError": "Test mislukt",
  "settings.waterPushTitle": "Quatt waterreservoir",
  "settings.waterPushBody": "Het reservoir van {room} moet geleegd worden.",
  "settings.testPushBody": "Meldingen werken.",
  "water.alert": "{room}: waterreservoir legen",
  "water.test": "Test waterreservoir-melding",
};

const messages: Record<Language, Record<MsgKey, string>> = { en, nl };

/** Translate `key` into `lang`, interpolating `{name}` placeholders from `params`.
 *  Falls back to English, then to the key itself. */
export function t(lang: Language, key: MsgKey, params?: Record<string, string | number>): string {
  let s = messages[lang]?.[key] ?? messages.en[key] ?? key;
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      s = s.replace(new RegExp(`\\{${k}\\}`, "g"), String(v));
    }
  }
  return s;
}

export const LANGUAGES: readonly Language[] = ["en", "nl"];
