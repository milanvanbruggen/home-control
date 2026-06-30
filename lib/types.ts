export type HvacMode = "cool" | "heat" | "off";

export interface ChillState {
  id: string;
  name: string;
  available: boolean;
  on: boolean;
  mode: HvacMode;
  temp: number | null;
  current: number | null;
  fan: string | null;
  min: number;
  max: number;
  step: number;
  fanOptions: string[];
  /** Raw Quatt status text (e.g. "On working" / "On starting"); null if unknown. */
  status: string | null;
  /** True when the Chill's condensate reservoir must be emptied. */
  waterWarning: boolean;
  /** Last cool/heat mode — kept so the selector still shows it while off; null if unknown. */
  lastMode: "cool" | "heat" | null;
}

export interface ThermostatState {
  id: string;
  name: string;
  available: boolean;
  current: number | null;   // room temperature
  setpoint: number | null;  // target setpoint
  min: number;
  max: number;
  step: number;
  status: "heating" | "cooling" | "idle" | "off";
  /** Tado wall-unit battery: true=low, false=ok, null=no sensor. */
  batteryLow: boolean | null;
  /** Number of Tado radiator valves reporting low battery. */
  valvesLow: number;
}

export interface SceneRef {
  id: string;
  name: string;
  /** Real CSS gradient from the Hue bridge, when available (else the UI falls
   *  back to the keyword/hash color). */
  gradient?: string;
}

/** A controllable Hue room: dimmable light group + its scenes + the active scene. */
export interface RoomState {
  key: string;
  name: string;
  lightId: string;
  on: boolean;
  brightness: number; // 0-100
  scenes: SceneRef[];
  /** Scene ids shown in the quick grid, in order (a subset of `scenes`). */
  favorites: string[];
  /** Id of the scene last activated in this room via this app (null = none/unknown). */
  activeScene: string | null;
}

export type GridDirection = "import" | "export" | "idle";

/** Normalized sky condition — day/night is carried separately in SkyState.isDay. */
export type SkyCondition =
  | "sunny" | "partly-cloudy" | "cloudy" | "fog"
  | "rain" | "pouring" | "snow" | "sleet" | "thunder"
  | "unknown";

export interface SkyState {
  condition: SkyCondition;
  isDay: boolean;
  cloudCoverage: number | null; // 0–100
  raw: string | null;           // HA raw condition, for debugging
}

export interface SolarState {
  available: boolean;
  currentPowerW: number | null;   // sensor.solaredge_current_power (W)
  netGridKw: number | null;       // consumption - production (kW); + = afname, - = teruglevering
  gridDirection: GridDirection;
  coveragePct: number | null;     // sensor.home_solar_percentage (%)
  lifetimeKwh: number | null;     // sensor.solaredge_lifetime_energy / 1000 (kWh)
  sky: SkyState;                  // weather-driven backdrop state
}

export type TariffMode = "simple" | "advanced";

export interface ElectricityTariff {
  mode: TariffMode;
  // eenvoudig
  importPrice: number | null;       // afnameprijs €/kWh
  exportPrice: number | null;       // terugleverprijs €/kWh
  // geavanceerd (dubbeltarief + saldering)
  importLow: number | null;         // afname dal (tarif_1) €/kWh
  importHigh: number | null;        // afname normaal (tarif_2) €/kWh
  feedInPrice: number | null;       // terugleververgoeding (overschot) €/kWh
  fixedFeedInPerDay: number | null; // vaste terugleverkosten €/dag
}

export interface SolarCostSummary {
  importKwh: number | null;
  exportKwh: number | null;
  importCost: number | null;
  exportEarnings: number | null;
}

export type SolarRange = "today" | "week" | "month" | "year";
export interface SolarHistoryPoint {
  t: number;            // epoch ms
  value: number | null; // W (power) of kWh (energy); null = geen data in bucket
}
export interface SolarHistoryResponse {
  range: SolarRange;
  chartType: "power" | "energy";
  unit: "W" | "kWh";
  points: SolarHistoryPoint[];
  summary: { producedKwh: number | null; cost: SolarCostSummary | null };
}

export interface AppState {
  chills: ChillState[];
  thermostat: ThermostatState | null;
  rooms: RoomState[];
  metrics: RoomMetrics[];
  solar: SolarState;
}

export interface HaEntityState {
  entity_id: string;
  state: string;
  attributes: Record<string, unknown>;
}

export type Theme = "light" | "dark" | "system";
export type Language = "en" | "nl";

/** App-wide settings, persisted server-side on the HA add-on box. */
export interface AppSettings {
  language: Language;
  theme: Theme;
  /** Per-room-key → curated scene ids shown first in that room's grid. */
  favorites: Record<string, string[]>;
  /** Send the LaMetric alert when a Quatt water reservoir needs emptying. */
  waterAlert: boolean;
  /** Deny-list of hidden metric widgets: room key → hidden metric kinds. */
  hiddenMetrics: Record<string, string[]>;
  /** Home-card order: card ids (lights / thermostat / chill ids / metric room keys). */
  cardOrder: string[];
  /** Deny-list of hidden home cards: card ids the user has hidden from the home screen. */
  hiddenCards: string[];
  /** Handmatig stroomtarief voor de kosten-weergave in de Solar-widget. */
  tariff: ElectricityTariff;
}

export type MetricKind = "temperature" | "humidity";

export interface MetricSensor {
  kind: MetricKind;
  entityId: string;
}

/** A live metric value as sent to the client. */
export interface MetricValue {
  kind: MetricKind;
  value: number | null; // raw reading; null = unavailable/unknown/missing
  unit: string;         // from HA unit_of_measurement, fallback per kind
  visible: boolean;     // server-computed from settings.hiddenMetrics
}

export interface RoomMetrics {
  key: string;
  name: string;
  metrics: MetricValue[];
}

export type ClimateActionKind = "on_off" | "set_mode" | "set_fan" | "set_temp";

export interface ClimateDeviceConfig {
  id: string;
  name: string;
  kind: "chill" | "thermostat";
  actions: readonly ClimateActionKind[];
  /** Optional HA sensor entity giving a human status string (e.g. sensor.zolder_status). */
  statusSensor?: string;
  /** Optional HA binary_sensor that is "on" when the water reservoir must be emptied. */
  waterSensor?: string;
}
