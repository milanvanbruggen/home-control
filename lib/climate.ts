import type { ChillState, ThermostatState, ClimateActionKind } from "@/lib/types";

export type ClimateRuntime = ChillState | ThermostatState;

type ValidationResult =
  | { ok: true; value: boolean | string | number }
  | { ok: false; error: string };

function isChill(r: ClimateRuntime): r is ChillState {
  return "fanOptions" in r;
}

export function validateClimateValue(
  action: ClimateActionKind,
  value: unknown,
  runtime: ClimateRuntime,
): ValidationResult {
  switch (action) {
    case "set_temp": {
      if (typeof value !== "number" || !Number.isFinite(value)) {
        return { ok: false, error: "temp_out_of_range" };
      }
      if (value < runtime.min || value > runtime.max) {
        return { ok: false, error: "temp_out_of_range" };
      }
      return { ok: true, value };
    }
    case "set_mode": {
      if (value === "cool" || value === "heat") return { ok: true, value };
      return { ok: false, error: "bad_mode" };
    }
    case "set_fan": {
      if (isChill(runtime) && typeof value === "string" && runtime.fanOptions.includes(value)) {
        return { ok: true, value };
      }
      return { ok: false, error: "bad_fan" };
    }
    case "on_off": {
      if (typeof value === "boolean") return { ok: true, value };
      return { ok: false, error: "bad_on_off" };
    }
    default:
      return { ok: false, error: "bad_action" };
  }
}

export function climateActionToService(
  id: string,
  action: ClimateActionKind,
  value: boolean | string | number,
  runtime: ClimateRuntime,
): { domain: "climate"; service: string; data: Record<string, unknown> } {
  switch (action) {
    case "set_temp":
      return { domain: "climate", service: "set_temperature", data: { entity_id: id, temperature: value } };
    case "set_mode":
      return { domain: "climate", service: "set_hvac_mode", data: { entity_id: id, hvac_mode: value } };
    case "set_fan":
      return { domain: "climate", service: "set_fan_mode", data: { entity_id: id, fan_mode: value } };
    case "on_off": {
      const currentMode = isChill(runtime) ? runtime.mode : "off";
      const onMode = currentMode && currentMode !== "off" ? currentMode : "cool";
      const hvac_mode = value ? onMode : "off";
      return { domain: "climate", service: "set_hvac_mode", data: { entity_id: id, hvac_mode } };
    }
  }
}
