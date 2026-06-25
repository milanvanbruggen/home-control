import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render as rtlRender, screen, fireEvent, waitFor } from "@testing-library/react";
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

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  // Empty series → both panels show the "collecting" state (no recharts in jsdom).
  fetchMock = vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve({ series: [] }) }));
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

describe("RoomMetricCard", () => {
  it("renders the room name, both metric values and Dutch labels", async () => {
    render(<RoomMetricCard room={room} />);
    expect(screen.getByText("Woonkamer")).toBeInTheDocument();
    expect(screen.getByText("21,4°C")).toBeInTheDocument();
    expect(screen.getByText("48%")).toBeInTheDocument();
    expect(screen.getByText("Temperatuur")).toBeInTheDocument();
    expect(screen.getByText("Luchtvochtigheid")).toBeInTheDocument();
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
  });

  it("fetches history for the room and default 24h range", async () => {
    render(<RoomMetricCard room={room} />);
    await waitFor(() => {
      const url = fetchMock.mock.calls[0][0] as string;
      expect(url).toContain("/api/history?room=woonkamer");
      expect(url).toContain("range=24h");
    });
  });

  it("refetches with the chosen range picked from the range menu", async () => {
    render(<RoomMetricCard room={room} />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    // Open the compact range menu (the pill shows the current range, "24u" in NL)…
    fireEvent.click(screen.getByRole("button", { name: /24u/ }));
    // …then pick 7d from the menu.
    fireEvent.click(screen.getByRole("menuitem", { name: /7d/ }));
    await waitFor(() => {
      const last = fetchMock.mock.calls.at(-1)![0] as string;
      expect(last).toContain("range=7d");
    });
  });

  it("shows the collecting state when there is too little history", async () => {
    render(<RoomMetricCard room={room} />);
    await waitFor(() => expect(screen.getAllByText("Gegevens verzamelen…").length).toBe(2));
  });

  it("renders one panel when only one metric is visible", async () => {
    render(<RoomMetricCard room={{ key: "zolder", name: "Zolder", metrics: [
      { kind: "temperature", value: 23.1, unit: "°C", visible: true },
      { kind: "humidity", value: 50, unit: "%", visible: false },
    ] }} />);
    expect(screen.getByText("23,1°C")).toBeInTheDocument();
    expect(screen.queryByText("Luchtvochtigheid")).toBeNull();
    await waitFor(() => expect(screen.getAllByText("Gegevens verzamelen…").length).toBe(1));
  });

  it("renders nothing (and does not fetch) when no metric is visible", () => {
    const { container } = render(<RoomMetricCard room={{ ...room, metrics: [
      { kind: "temperature", value: 21.4, unit: "°C", visible: false },
    ] }} />);
    expect(container).toBeEmptyDOMElement();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
