import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { ThermostatCard } from "@/app/components/ThermostatCard";
import type { ThermostatState } from "@/lib/types";

const thermostat: ThermostatState = {
  id: "climate.woonkamer_woonkamer", name: "Thermostaat", available: true,
  current: 19.6, setpoint: 20, min: 5, max: 25, step: 0.5, status: "heating",
};

describe("ThermostatCard (controllable)", () => {
  it("renders name, current temp, setpoint and status", () => {
    render(<ThermostatCard thermostat={thermostat} onAction={() => {}} />);
    expect(screen.getByText("Thermostaat")).toBeInTheDocument();
    expect(screen.getByText(/19[.,]6/)).toBeInTheDocument();
    expect(screen.getByText(/20[.,]0°C/)).toBeInTheDocument();
    expect(screen.getByText("Verwarmt")).toBeInTheDocument();
  });

  it("shows the cooling/idle status labels", () => {
    const { rerender } = render(<ThermostatCard thermostat={{ ...thermostat, status: "cooling" }} onAction={() => {}} />);
    expect(screen.getByText("Koelt")).toBeInTheDocument();
    rerender(<ThermostatCard thermostat={{ ...thermostat, status: "idle" }} onAction={() => {}} />);
    expect(screen.getByText("Inactief")).toBeInTheDocument();
  });

  it("shows 'Uit' instead of the frost-protection setpoint when off", () => {
    render(<ThermostatCard thermostat={{ ...thermostat, status: "off", setpoint: 5 }} onAction={() => {}} />);
    expect(screen.getAllByText("Uit").length).toBeGreaterThan(0); // status badge + big number
    expect(screen.queryByText(/5[.,]0°C/)).toBeNull();
  });

  it("raises the setpoint by the step and sends a debounced set_temp", () => {
    vi.useFakeTimers();
    const onAction = vi.fn();
    render(<ThermostatCard thermostat={thermostat} onAction={onAction} />);
    fireEvent.click(screen.getByRole("button", { name: "+" }));
    expect(screen.getByText(/20[.,]5°C/)).toBeInTheDocument(); // optimistic, immediate
    expect(onAction).not.toHaveBeenCalled();
    act(() => { vi.advanceTimersByTime(400); });
    expect(onAction).toHaveBeenCalledWith("set_temp", 20.5);
    vi.useRealTimers();
  });

  it("lowers the setpoint by the step", () => {
    vi.useFakeTimers();
    const onAction = vi.fn();
    render(<ThermostatCard thermostat={thermostat} onAction={onAction} />);
    fireEvent.click(screen.getByRole("button", { name: "−" }));
    act(() => { vi.advanceTimersByTime(400); });
    expect(onAction).toHaveBeenCalledWith("set_temp", 19.5);
    vi.useRealTimers();
  });

  it("disables the buttons at the min/max bounds", () => {
    const { rerender } = render(<ThermostatCard thermostat={{ ...thermostat, setpoint: 25 }} onAction={() => {}} />);
    expect(screen.getByRole("button", { name: "+" })).toBeDisabled();
    rerender(<ThermostatCard thermostat={{ ...thermostat, setpoint: 5 }} onAction={() => {}} />);
    expect(screen.getByRole("button", { name: "−" })).toBeDisabled();
  });

  it("disables controls when unavailable", () => {
    render(<ThermostatCard thermostat={{ ...thermostat, available: false }} onAction={() => {}} />);
    expect(screen.getByRole("button", { name: "+" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "−" })).toBeDisabled();
  });
});
