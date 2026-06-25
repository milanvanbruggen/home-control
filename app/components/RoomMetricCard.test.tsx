import { describe, it, expect } from "vitest";
import { render as rtlRender, screen } from "@testing-library/react";
import type { ReactElement, ReactNode } from "react";
import { RoomMetricCard } from "@/app/components/RoomMetricCard";
import { LanguageProvider } from "@/app/components/LanguageProvider";
import type { RoomMetrics } from "@/lib/types";

function NL({ children }: { children: ReactNode }) {
  return <LanguageProvider initial="nl">{children}</LanguageProvider>;
}
const render = (ui: ReactElement) => rtlRender(ui, { wrapper: NL });

const room: RoomMetrics = {
  key: "woonkamer", name: "Woonkamer",
  metrics: [
    { kind: "temperature", value: 21.4, unit: "°C", visible: true },
    { kind: "humidity", value: 48, unit: "%", visible: true },
  ],
};

describe("RoomMetricCard", () => {
  it("renders the room name, values and Dutch labels", () => {
    render(<RoomMetricCard room={room} />);
    expect(screen.getByText("Woonkamer")).toBeInTheDocument();
    expect(screen.getByText("21,4°C")).toBeInTheDocument();
    expect(screen.getByText("48%")).toBeInTheDocument();
    expect(screen.getByText("Temperatuur")).toBeInTheDocument();
    expect(screen.getByText("Luchtvochtigheid")).toBeInTheDocument();
  });

  it("omits metrics whose visible is false", () => {
    render(<RoomMetricCard room={{ ...room, metrics: [
      { kind: "temperature", value: 21.4, unit: "°C", visible: true },
      { kind: "humidity", value: 48, unit: "%", visible: false },
    ] }} />);
    expect(screen.getByText("21,4°C")).toBeInTheDocument();
    expect(screen.queryByText("48%")).toBeNull();
  });

  it("renders nothing when no metric is visible", () => {
    const { container } = render(<RoomMetricCard room={{ ...room, metrics: [
      { kind: "temperature", value: 21.4, unit: "°C", visible: false },
    ] }} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("shows an em dash when the value is null", () => {
    render(<RoomMetricCard room={{ key: "zolder", name: "Zolder", metrics: [
      { kind: "temperature", value: null, unit: "°C", visible: true },
    ] }} />);
    expect(screen.getByText("—")).toBeInTheDocument();
  });
});
