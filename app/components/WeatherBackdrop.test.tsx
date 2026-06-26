import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { WeatherBackdrop } from "@/app/components/WeatherBackdrop";
import { resolveSkyVisual } from "@/lib/sky-visuals";

describe("WeatherBackdrop", () => {
  it("renders only the scrim for a clear sunny day (no clouds, no rain)", () => {
    const { container } = render(<WeatherBackdrop visual={resolveSkyVisual("sunny", true)} />);
    expect(container.querySelector(".wx-cloud")).toBeNull();
    expect(container.querySelector(".wx-drop")).toBeNull();
    expect(container.querySelector(".wx-scrim")).toBeTruthy();
  });

  it("renders stars at night for a clear sky", () => {
    const { container } = render(<WeatherBackdrop visual={resolveSkyVisual("sunny", false)} />);
    expect(container.querySelectorAll(".wx-star").length).toBeGreaterThan(0);
    expect(container.querySelector(".wx-drop")).toBeNull();
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

  it("flashes lightning and falls rain for thunder", () => {
    const { container } = render(<WeatherBackdrop visual={resolveSkyVisual("thunder", true)} />);
    expect(container.querySelector(".wx-flash")).toBeTruthy();
    expect(container.querySelectorAll(".wx-drop").length).toBeGreaterThan(0);
  });

  it("renders denser drops for a downpour than for plain rain", () => {
    const rain = render(<WeatherBackdrop visual={resolveSkyVisual("rain", true)} />);
    const pour = render(<WeatherBackdrop visual={resolveSkyVisual("pouring", true)} />);
    expect(pour.container.querySelectorAll(".wx-drop").length)
      .toBeGreaterThan(rain.container.querySelectorAll(".wx-drop").length);
  });
});
