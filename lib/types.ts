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
}

export interface ThermostatState {
  name: string;
  available: boolean;
  current: number | null;   // room temperature
  setpoint: number | null;  // room setpoint
  status: "heating" | "cooling" | "idle";
}

export interface SceneRef {
  id: string;
  name: string;
}

export interface LightState {
  id: string;
  name: string;
  on: boolean;
  brightness: number; // 0-100
}

export interface AppState {
  chills: ChillState[];
  thermostat: ThermostatState | null;
  scenes: SceneRef[];
  allScenes: SceneRef[];
  lights: LightState[];
}

export interface HaEntityState {
  entity_id: string;
  state: string;
  attributes: Record<string, unknown>;
}

export type ClimateActionKind = "on_off" | "set_mode" | "set_fan" | "set_temp";

export interface ClimateDeviceConfig {
  id: string;
  name: string;
  kind: "chill" | "thermostat";
  actions: readonly ClimateActionKind[];
  /** Optional HA sensor entity giving a human status string (e.g. sensor.zolder_status). */
  statusSensor?: string;
}
