import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { WeatherBackdrop } from "@/app/components/WeatherBackdrop";
import { resolveSkyVisual } from "@/lib/sky-visuals";

describe("WeatherBackdrop", () => {
  it("renders sun glow + rays for a sunny day, no rain, plus the scrim", () => {
    const { container } = render(<WeatherBackdrop visual={resolveSkyVisual("sunny", true)} />);
    expect(container.querySelector(".wx-sun-glow")).toBeTruthy();
    expect(container.querySelector(".wx-rays")).toBeTruthy();
    expect(container.querySelector(".wx-drop")).toBeNull();
    expect(container.querySelector(".wx-scrim")).toBeTruthy();
  });

  it("renders moon + stars at night for a clear sky and no sun glow", () => {
    const { container } = render(<WeatherBackdrop visual={resolveSkyVisual("sunny", false)} />);
    expect(container.querySelector(".wx-moon")).toBeTruthy();
    expect(container.querySelectorAll(".wx-star").length).toBeGreaterThan(0);
    expect(container.querySelector(".wx-sun-glow")).toBeNull();
  });

  it("renders drifting clouds + falling drops for rain", () => {
    const { container } = render(<WeatherBackdrop visual={resolveSkyVisual("rain", true)} />);
    expect(container.querySelectorAll(".wx-cloud").length).toBeGreaterThan(0);
    expect(container.querySelectorAll(".wx-drop").length).toBeGreaterThan(0);
  });

  it("renders flakes for snow, not rain drops", () => {
    const { container } = render(<WeatherBackdrop visual={resolveSkyVisual("snow", true)} />);
    expect(container.querySelectorAll(".wx-flake").length).toBeGreaterThan(0);
    expect(container.querySelector(".wx-drop")).toBeNull();
  });
});
