import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { ChillCard } from "@/app/components/ChillCard";
import type { ChillState } from "@/lib/types";

const chill: ChillState = {
  id: "climate.zolder_chill", name: "Zolder", available: true, on: true,
  mode: "cool", temp: 18, current: 24.4, fan: "Hoog",
  min: 16, max: 30, step: 1, fanOptions: ["Laag", "Normaal", "Hoog"],
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
});
