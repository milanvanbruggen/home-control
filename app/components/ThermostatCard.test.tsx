import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ThermostatCard } from "@/app/components/ThermostatCard";
import type { ThermostatState } from "@/lib/types";

const thermostat: ThermostatState = {
  name: "Thermostaat", available: true, current: 19.6, setpoint: 20, status: "heating",
};

describe("ThermostatCard (read-only)", () => {
  it("renders name, current temp, setpoint and status", () => {
    render(<ThermostatCard thermostat={thermostat} />);
    expect(screen.getByText("Thermostaat")).toBeInTheDocument();
    expect(screen.getByText(/19[.,]6/)).toBeInTheDocument();
    expect(screen.getByText(/Ingesteld: 20[.,]0/)).toBeInTheDocument();
    expect(screen.getByText("Verwarmt")).toBeInTheDocument();
  });

  it("shows the cooling/idle status labels", () => {
    const { rerender } = render(<ThermostatCard thermostat={{ ...thermostat, status: "cooling" }} />);
    expect(screen.getByText("Koelt")).toBeInTheDocument();
    rerender(<ThermostatCard thermostat={{ ...thermostat, status: "idle" }} />);
    expect(screen.getByText("Inactief")).toBeInTheDocument();
  });

  it("has no control buttons (read-only)", () => {
    render(<ThermostatCard thermostat={thermostat} />);
    expect(screen.queryByRole("button")).toBeNull();
  });
});
