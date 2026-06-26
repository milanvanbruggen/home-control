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
