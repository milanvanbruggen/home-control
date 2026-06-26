import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render as rtlRender, screen, waitFor } from "@testing-library/react";
import type { ReactElement, ReactNode } from "react";
import { SolarCard } from "@/app/components/SolarCard";
import { LanguageProvider } from "@/app/components/LanguageProvider";
import type { SolarState } from "@/lib/types";

function NL({ children }: { children: ReactNode }) {
  return <LanguageProvider initial="nl">{children}</LanguageProvider>;
}
const render = (ui: ReactElement) => rtlRender(ui, { wrapper: NL });

const solar: SolarState = {
  available: true, currentPowerW: 3240, netGridKw: -1.8,
  gridDirection: "export", coveragePct: 100, lifetimeKwh: 16186,
};

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  fetchMock = vi.fn(() => Promise.resolve({
    ok: true,
    json: () => Promise.resolve({
      range: "today", chartType: "power", unit: "W",
      points: [], summary: { producedKwh: 18.4 },
    }),
  }));
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

describe("SolarCard", () => {
  it("renders the live hero in kW with a NL comma", () => {
    render(<SolarCard solar={solar} />);
    expect(screen.getByText("3,24")).toBeInTheDocument();
  });

  it("labels the net stat as export (Naar net) with the absolute value", () => {
    render(<SolarCard solar={solar} />);
    expect(screen.getByText("Naar net")).toBeInTheDocument();
    expect(screen.getByText("1,80 kW")).toBeInTheDocument();
  });

  it("fetches today's history on mount and shows produced kWh", async () => {
    render(<SolarCard solar={solar} />);
    expect(fetchMock).toHaveBeenCalledWith("/api/solar-history?range=today");
    await waitFor(() => expect(screen.getByText("18,4 kWh")).toBeInTheDocument());
  });
});
