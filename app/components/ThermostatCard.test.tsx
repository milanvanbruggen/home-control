import { describe, it, expect, vi } from "vitest";
import { render as rtlRender, screen, fireEvent, act } from "@testing-library/react";
import type { ReactElement, ReactNode } from "react";
import { ThermostatCard } from "@/app/components/ThermostatCard";
import { LanguageProvider } from "@/app/components/LanguageProvider";
import type { ThermostatState } from "@/lib/types";

// Render inside the Dutch provider so these assertions keep testing the NL strings.
function NL({ children }: { children: ReactNode }) {
  return <LanguageProvider initial="nl">{children}</LanguageProvider>;
}
const render = (ui: ReactElement) => rtlRender(ui, { wrapper: NL });

const thermostat: ThermostatState = {
  id: "climate.woonkamer_woonkamer", name: "Thermostaat", available: true,
  current: 19.6, setpoint: 20, min: 5, max: 25, step: 0.5, status: "heating",
  batteryLow: false, valvesLow: 0,
};

// Battery/valve tests use English for clarity (matching the brief's assertions).
function EN({ children }: { children: import("react").ReactNode }) {
  return <LanguageProvider initial="en">{children}</LanguageProvider>;
}
const renderEN = (ui: import("react").ReactElement) => rtlRender(ui, { wrapper: EN });

function thermo(over: Partial<ThermostatState> = {}): ThermostatState {
  return { id: "climate.x", name: "Thermostat", available: true, current: 20, setpoint: 21, min: 5, max: 25, step: 0.5, status: "heating", batteryLow: false, valvesLow: 0, ...over };
}

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
    expect(screen.getAllByText("Uit").length).toBeGreaterThan(0); // status badge (off state is compact, no big number)
    expect(screen.queryByText(/5[.,]0°C/)).toBeNull();
  });

  it("hides the temperature controls when off", () => {
    render(<ThermostatCard thermostat={{ ...thermostat, status: "off" }} onAction={() => {}} />);
    expect(screen.queryByRole("button", { name: "+" })).toBeNull();
    expect(screen.queryByRole("button", { name: "−" })).toBeNull();
  });

  it("turns the thermostat on via the toggle when off", () => {
    const onAction = vi.fn();
    render(<ThermostatCard thermostat={{ ...thermostat, status: "off" }} onAction={onAction} />);
    fireEvent.click(screen.getByRole("button", { name: "aan/uit" }));
    expect(onAction).toHaveBeenCalledWith("on_off", true);
  });

  it("turns the thermostat off via the toggle when on", () => {
    const onAction = vi.fn();
    render(<ThermostatCard thermostat={{ ...thermostat, status: "heating" }} onAction={onAction} />);
    fireEvent.click(screen.getByRole("button", { name: "aan/uit" }));
    expect(onAction).toHaveBeenCalledWith("on_off", false);
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

describe("ThermostatCard battery", () => {
  it("shows an ok battery icon when batteryLow is false", () => {
    renderEN(<ThermostatCard thermostat={thermo()} onAction={() => {}} />);
    expect(screen.getByLabelText("Battery OK")).toBeTruthy();
  });
  it("shows a red low battery icon when batteryLow is true", () => {
    renderEN(<ThermostatCard thermostat={thermo({ batteryLow: true })} onAction={() => {}} />);
    expect(screen.getByLabelText("Battery low")).toHaveClass("text-[#e85f4c]");
  });
  it("shows no battery icon when batteryLow is null", () => {
    renderEN(<ThermostatCard thermostat={thermo({ batteryLow: null })} onAction={() => {}} />);
    expect(screen.queryByLabelText(/Battery/)).toBeNull();
  });
  it("shows the singular valve warning when one valve is low", () => {
    renderEN(<ThermostatCard thermostat={thermo({ valvesLow: 1 })} onAction={() => {}} />);
    expect(screen.getByText("Radiator valve battery low")).toBeTruthy();
  });
  it("shows the plural valve warning with the count", () => {
    renderEN(<ThermostatCard thermostat={thermo({ valvesLow: 3 })} onAction={() => {}} />);
    expect(screen.getByText("3 radiator valves battery low")).toBeTruthy();
  });
  it("shows no valve warning when none are low", () => {
    renderEN(<ThermostatCard thermostat={thermo({ valvesLow: 0 })} onAction={() => {}} />);
    expect(screen.queryByText(/valve/i)).toBeNull();
  });
});
