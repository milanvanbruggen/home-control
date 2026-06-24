import { describe, it, expect, vi } from "vitest";
import { render as rtlRender, screen, fireEvent, act } from "@testing-library/react";
import type { ReactElement, ReactNode } from "react";
import { ChillCard } from "@/app/components/ChillCard";
import { LanguageProvider } from "@/app/components/LanguageProvider";
import type { ChillState } from "@/lib/types";

// Render inside the Dutch provider so these assertions keep testing the NL strings.
function NL({ children }: { children: ReactNode }) {
  return <LanguageProvider initial="nl">{children}</LanguageProvider>;
}
const render = (ui: ReactElement) => rtlRender(ui, { wrapper: NL });

const chill: ChillState = {
  id: "climate.zolder_chill", name: "Zolder", available: true, on: true,
  mode: "cool", temp: 18, current: 24.4, fan: "Hoog",
  min: 16, max: 30, step: 1, fanOptions: ["Laag", "Normaal", "Hoog"], status: null,
  waterWarning: false,
};

describe("ChillCard", () => {
  it("renders name, current and setpoint", () => {
    render(<ChillCard chill={chill} onAction={() => {}} />);
    expect(screen.getByText("Zolder")).toBeInTheDocument();
    expect(screen.getByText(/24[.,]4/)).toBeInTheDocument();
    expect(screen.getByText("18°C")).toBeInTheDocument();
  });

  it("calls onAction set_mode heat when Verwarmen is tapped", () => {
    const onAction = vi.fn();
    render(<ChillCard chill={chill} onAction={onAction} />);
    fireEvent.click(screen.getByRole("button", { name: /Verwarmen/i }));
    expect(onAction).toHaveBeenCalledWith("set_mode", "heat");
  });

  it("calls onAction set_fan when a fan speed is tapped", () => {
    const onAction = vi.fn();
    render(<ChillCard chill={chill} onAction={onAction} />);
    fireEvent.click(screen.getByRole("button", { name: /Laag/i }));
    expect(onAction).toHaveBeenCalledWith("set_fan", "Laag");
  });

  it("shows Dutch fan labels in low→high order for English Quatt values", () => {
    const onAction = vi.fn();
    const enChill: ChillState = { ...chill, fan: "High", fanOptions: ["High", "Normal", "Low"] };
    render(<ChillCard chill={enChill} onAction={onAction} />);
    const fanButtons = screen
      .getAllByRole("button")
      .filter((b) => ["Laag", "Normaal", "Hoog"].includes(b.textContent || ""));
    expect(fanButtons.map((b) => b.textContent)).toEqual(["Laag", "Normaal", "Hoog"]);
    fireEvent.click(screen.getByRole("button", { name: "Hoog" }));
    expect(onAction).toHaveBeenCalledWith("set_fan", "High");
  });

  it("shows a Dutch status badge from the Quatt status sensor", () => {
    render(<ChillCard chill={{ ...chill, status: "On starting" }} onAction={() => {}} />);
    expect(screen.getByText("Aan het starten")).toBeInTheDocument();
  });

  it("hides the status badge when status is null", () => {
    render(<ChillCard chill={{ ...chill, status: null }} onAction={() => {}} />);
    expect(screen.queryByText(/Aan het|Wacht op/)).toBeNull();
  });

  it("shows the water-reservoir warning when waterWarning is true", () => {
    render(<ChillCard chill={{ ...chill, waterWarning: true }} onAction={() => {}} />);
    expect(screen.getByText("Waterreservoir legen")).toBeInTheDocument();
  });

  it("hides the water-reservoir warning when waterWarning is false", () => {
    render(<ChillCard chill={chill} onAction={() => {}} />);
    expect(screen.queryByText("Waterreservoir legen")).toBeNull();
  });

  it("disables − at the minimum temperature and + at the maximum", () => {
    const { rerender } = render(<ChillCard chill={{ ...chill, temp: chill.min }} onAction={() => {}} />);
    expect(screen.getByRole("button", { name: "−" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "+" })).not.toBeDisabled();
    rerender(<ChillCard chill={{ ...chill, temp: chill.max }} onAction={() => {}} />);
    expect(screen.getByRole("button", { name: "+" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "−" })).not.toBeDisabled();
  });

  it("calls onAction on_off=false when power is tapped while on", () => {
    const onAction = vi.fn();
    render(<ChillCard chill={chill} onAction={onAction} />);
    fireEvent.click(screen.getByRole("button", { name: /aan\/uit/i }));
    expect(onAction).toHaveBeenCalledWith("on_off", false);
  });

  it("debounces temperature changes and sends the final value", () => {
    vi.useFakeTimers();
    const onAction = vi.fn();
    render(<ChillCard chill={chill} onAction={onAction} />);
    fireEvent.click(screen.getByRole("button", { name: "+" }));
    fireEvent.click(screen.getByRole("button", { name: "+" }));
    expect(screen.getByText("20°C")).toBeInTheDocument(); // optimistic 18 -> 20
    expect(onAction).not.toHaveBeenCalledWith("set_temp", expect.anything());
    act(() => { vi.advanceTimersByTime(400); });
    expect(onAction).toHaveBeenCalledWith("set_temp", 20);
    expect(onAction).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  it("keeps the mode toggle pending and disabled until the server confirms", () => {
    const onAction = vi.fn();
    const { rerender } = render(<ChillCard chill={chill} onAction={onAction} />);
    fireEvent.click(screen.getByRole("button", { name: /Verwarmen/i }));
    expect(onAction).toHaveBeenCalledWith("set_mode", "heat");
    // both mode segments disabled while the request is in flight
    expect(screen.getByRole("button", { name: /Koelen/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /Verwarmen/i })).toBeDisabled();
    // server confirms heat -> the toggle re-enables
    rerender(<ChillCard chill={{ ...chill, mode: "heat" }} onAction={onAction} />);
    expect(screen.getByRole("button", { name: /Verwarmen/i })).not.toBeDisabled();
    expect(screen.getByRole("button", { name: /Koelen/i })).not.toBeDisabled();
  });
});
