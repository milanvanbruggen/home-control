import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render as rtlRender, screen, waitFor, fireEvent } from "@testing-library/react";
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
      points: [], summary: { producedKwh: 18.4, cost: null },
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

  it("labels the net stat as export (Teruglevering) with the absolute value", () => {
    render(<SolarCard solar={solar} />);
    expect(screen.getByText("Teruglevering")).toBeInTheDocument();
    expect(screen.getByText("1,80 kW")).toBeInTheDocument();
  });

  it("labels the net stat as Afname when importing", () => {
    render(<SolarCard solar={{ ...solar, netGridKw: 1.0, gridDirection: "import" }} />);
    expect(screen.getByText("Afname")).toBeInTheDocument();
  });

  it("shows an info popover on the Dekking stat when tapped", () => {
    render(<SolarCard solar={solar} />);
    const btn = screen.getByRole("button", { name: /Uitleg: Dekking/i });
    expect(screen.queryByText(/Aandeel van je huidige verbruik/i)).not.toBeInTheDocument();
    fireEvent.click(btn);
    expect(screen.getByText(/Aandeel van je huidige verbruik/i)).toBeInTheDocument();
  });

  it("shows info buttons on the Dekking and net stats only", () => {
    render(<SolarCard solar={solar} />);
    expect(screen.getAllByRole("button", { name: /Uitleg:/i })).toHaveLength(2);
  });

  it("explains the net stat via its info button", () => {
    render(<SolarCard solar={solar} />);
    fireEvent.click(screen.getByRole("button", { name: /Uitleg: Teruglevering/i }));
    expect(screen.getByText(/van het net afneemt of eraan teruglevert/i)).toBeInTheDocument();
  });

  it("fetches today's history on mount and shows produced kWh", async () => {
    render(<SolarCard solar={solar} />);
    expect(fetchMock).toHaveBeenCalledWith("/api/solar-history?range=today");
    await waitFor(() => expect(screen.getByText("18,4 kWh")).toBeInTheDocument());
  });

  it("shows a cost/earnings row when the response includes cost", async () => {
    fetchMock.mockImplementation(() => Promise.resolve({
      ok: true,
      json: () => Promise.resolve({
        range: "today", chartType: "power", unit: "W", points: [],
        summary: { producedKwh: 18.4, cost: { importKwh: 10, exportKwh: 5, importCost: 2.3, exportEarnings: 0.4 } },
      }),
    }));
    render(<SolarCard solar={solar} />);
    await waitFor(() => expect(screen.getByText("Kosten")).toBeInTheDocument());
    expect(screen.getByText("€ 2,30")).toBeInTheDocument();
    expect(screen.getByText("Opbrengst")).toBeInTheDocument();
    expect(screen.getByText("€ 0,40")).toBeInTheDocument();
  });

  it("hides the cost row when cost is null", async () => {
    render(<SolarCard solar={solar} />); // default mock returns cost-less summary
    await waitFor(() => expect(screen.getByText("18,4 kWh")).toBeInTheDocument());
    expect(screen.queryByText("Kosten")).not.toBeInTheDocument();
  });

  it("shows an unavailable state and hides the stats when solar is unavailable", () => {
    render(<SolarCard solar={{ ...solar, available: false }} />);
    expect(screen.getByText("Niet beschikbaar")).toBeInTheDocument();
    expect(screen.queryByText("Dekking")).not.toBeInTheDocument();
  });
});
