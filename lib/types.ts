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
}

export interface ThermostatState {
  id: string;
  name: string;
  available: boolean;
  temp: number | null;
  current: number | null;
  min: number;
  max: number;
  step: number;
}

export interface SceneRef {
  id: string;
  name: string;
}

export interface AppState {
  chills: ChillState[];
  thermostat: ThermostatState | null;
  scenes: SceneRef[];
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
}
