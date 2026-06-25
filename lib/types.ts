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

export interface AppState {
  chills: ChillState[];
  thermostat: ThermostatState | null;
  rooms: RoomState[];
  metrics: RoomMetrics[];
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
