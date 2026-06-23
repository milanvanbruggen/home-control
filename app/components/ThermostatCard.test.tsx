import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { ThermostatCard } from "@/app/components/ThermostatCard";
import type { ThermostatState } from "@/lib/types";

const thermostat: ThermostatState = {
  id: "climate.thermostaat", name: "Thermostaat", available: true,
  temp: 20, current: 19.6, min: 5, max: 30, step: 0.5,
};

describe("ThermostatCard", () => {
  it("renders the setpoint and current temp", () => {
    render(<ThermostatCard thermostat={thermostat} onAction={() => {}} />);
    expect(screen.getByText("Thermostaat")).toBeInTheDocument();
    expect(screen.getByText("20°C")).toBeInTheDocument();
    expect(screen.getByText(/19[.,]6/)).toBeInTheDocument();
  });

  it("debounces and sends the stepped setpoint", () => {
    vi.useFakeTimers();
    const onAction = vi.fn();
    render(<ThermostatCard thermostat={thermostat} onAction={onAction} />);
    fireEvent.click(screen.getByRole("button", { name: "+" })); // 20 -> 20.5
    expect(screen.getByText("20.5°C")).toBeInTheDocument();
    act(() => { vi.advanceTimersByTime(400); });
    expect(onAction).toHaveBeenCalledWith("set_temp", 20.5);
    vi.useRealTimers();
  });
});
