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
  status: "heating" | "cooling" | "idle";
}

export interface SceneRef {
  id: string;
  name: string;
}

/** A controllable Hue room: dimmable light group + its scenes + the active scene. */
export interface RoomState {
  key: string;
  name: string;
  lightId: string;
  on: boolean;
  brightness: number; // 0-100
  scenes: SceneRef[];
  /** Id of the scene last activated in this room via this app (null = none/unknown). */
  activeScene: string | null;
}

export interface AppState {
  chills: ChillState[];
  thermostat: ThermostatState | null;
  rooms: RoomState[];
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
  /** Optional HA binary_sensor that is "on" when the water reservoir must be emptied. */
  waterSensor?: string;
}
