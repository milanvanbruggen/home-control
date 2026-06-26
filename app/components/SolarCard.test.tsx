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
  sky: { condition: "sunny", isDay: true, cloudCoverage: 20, raw: "sunny" },
};

const DEFAULT_HISTORY = { range: "today", chartType: "power", unit: "W", points: [], summary: { producedKwh: 18.4, cost: null } };
const SIMPLE_TARIFF = { mode: "simple", importPrice: 0.25, exportPrice: 0.1, importLow: null, importHigh: null, feedInPrice: null, fixedFeedInPerDay: null };

// Route the two endpoints the card hits: /api/settings (tariff → whether the cost row
// shows) and /api/solar-history (chart + produced + cost). `settings` defaults to no
// tariff, so the cost row stays hidden unless a test opts in.
function makeFetch({ history, settings }: { history?: unknown; settings?: unknown } = {}) {
  return vi.fn((url: string) =>
    Promise.resolve({
      ok: true,
      json: () => Promise.resolve(url.startsWith("/api/settings") ? settings ?? {} : history ?? DEFAULT_HISTORY),
    }),
  );
}

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  fetchMock = makeFetch();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

describe("SolarCard", () => {
  it("renders the live hero in kW with a NL comma", async () => {
    render(<SolarCard solar={solar} />);
    expect(await screen.findByText("3,24")).toBeInTheDocument();
  });

  it("labels the net stat as export (Teruglevering) with the absolute value", async () => {
    render(<SolarCard solar={solar} />);
    expect(await screen.findByText("Teruglevering")).toBeInTheDocument();
    expect(screen.getByText("1,80 kW")).toBeInTheDocument();
  });

  it("labels the net stat as Afname when importing", async () => {
    render(<SolarCard solar={{ ...solar, netGridKw: 1.0, gridDirection: "import" }} />);
    expect(await screen.findByText("Afname")).toBeInTheDocument();
  });

  it("shows an info popover on the Dekking stat when tapped", async () => {
    render(<SolarCard solar={solar} />);
    const btn = await screen.findByRole("button", { name: /Uitleg: Dekking/i });
    expect(screen.queryByText(/Aandeel van je huidige verbruik/i)).not.toBeInTheDocument();
    fireEvent.click(btn);
    expect(screen.getByText(/Aandeel van je huidige verbruik/i)).toBeInTheDocument();
  });

  it("shows info buttons on the Dekking and net stats only", async () => {
    render(<SolarCard solar={solar} />);
    await screen.findByText("18,4 kWh"); // wait for the stats to stagger in
    expect(screen.getAllByRole("button", { name: /Uitleg:/i })).toHaveLength(2);
  });

  it("explains the net stat via its info button", async () => {
    render(<SolarCard solar={solar} />);
    fireEvent.click(await screen.findByRole("button", { name: /Uitleg: Teruglevering/i }));
    expect(screen.getByText(/van het net afneemt of eraan teruglevert/i)).toBeInTheDocument();
  });

  it("fetches today's history on mount and shows produced kWh", async () => {
    render(<SolarCard solar={solar} />);
    expect(fetchMock).toHaveBeenCalledWith("/api/solar-history?range=today");
    await waitFor(() => expect(screen.getByText("18,4 kWh")).toBeInTheDocument());
  });

  it("shows one spinner overlay for the whole widget while the history is still loading", () => {
    fetchMock.mockImplementation(() => new Promise(() => {})); // never resolves
    const { container } = render(<SolarCard solar={solar} />);
    expect(container.querySelector(".animate-spin")).toBeTruthy();
    expect(screen.getByRole("status")).toBeInTheDocument();
    // Real data isn't shown yet, but the body is present-but-hidden so it reserves
    // its final height (no layout jump). The hero sits inside the aria-hidden region.
    expect(screen.queryByText("18,4 kWh")).not.toBeInTheDocument();
    expect(screen.getByText("3,24").closest('[aria-hidden="true"]')).toBeTruthy();
  });

  it("replaces the spinner with the staggered parts once the history resolves", async () => {
    const { container } = render(<SolarCard solar={solar} />);
    expect(container.querySelector(".animate-spin")).toBeTruthy();
    await waitFor(() => expect(screen.getByText("18,4 kWh")).toBeInTheDocument());
    expect(container.querySelector(".animate-spin")).toBeNull();
    // Hero, chart panel and stats row each animate in (animate-rise).
    expect(container.querySelectorAll(".animate-rise").length).toBeGreaterThanOrEqual(3);
  });

  it("shows a cost/earnings row when a tariff is set and the response includes cost", async () => {
    fetchMock = makeFetch({
      settings: { tariff: SIMPLE_TARIFF },
      history: { range: "today", chartType: "power", unit: "W", points: [], summary: { producedKwh: 18.4, cost: { importKwh: 10, exportKwh: 5, importCost: 2.3, exportEarnings: 0.4 } } },
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<SolarCard solar={solar} />);
    await waitFor(() => expect(screen.getByText("Kosten")).toBeInTheDocument());
    expect(screen.getByText("€ 2,30")).toBeInTheDocument();
    expect(screen.getByText("Opbrengst")).toBeInTheDocument();
    expect(screen.getByText("€ 0,40")).toBeInTheDocument();
  });

  it("hides the cost row when no tariff is configured", async () => {
    render(<SolarCard solar={solar} />); // default settings → no tariff
    await waitFor(() => expect(screen.getByText("18,4 kWh")).toBeInTheDocument());
    expect(screen.queryByText("Kosten")).not.toBeInTheDocument();
  });

  it("reserves the cost-row slot while loading when a tariff is set, so it never pops in after load", async () => {
    // Tariff resolves, history hangs → still loading, but the cost row is already in the
    // DOM (hidden) reserving its height; the body waits on the tariff flag for this reason.
    fetchMock = vi.fn((url: string) =>
      url.startsWith("/api/settings")
        ? Promise.resolve({ ok: true, json: () => Promise.resolve({ tariff: SIMPLE_TARIFF }) })
        : new Promise(() => {}),
    );
    vi.stubGlobal("fetch", fetchMock);
    render(<SolarCard solar={solar} />);
    const cost = await screen.findByText("Kosten");
    expect(cost.closest('[aria-hidden="true"]')).toBeTruthy(); // present but hidden = reserving height
  });

  it("shows an unavailable state and hides the stats when solar is unavailable", () => {
    render(<SolarCard solar={{ ...solar, available: false }} />);
    expect(screen.getByText("Niet beschikbaar")).toBeInTheDocument();
    expect(screen.queryByText("Dekking")).not.toBeInTheDocument();
  });

  it("paints a sunny-day backdrop and keeps the hero readable", async () => {
    const { container } = render(<SolarCard solar={solar} />);
    expect(container.querySelector('[data-sky="sunny-day"]')).toBeTruthy();
    expect(container.querySelector(".wx-scrim")).toBeTruthy();
    expect(await screen.findByText("3,24")).toBeInTheDocument();
  });

  it("switches to a night backdrop when the sun is down", () => {
    const { container } = render(
      <SolarCard solar={{ ...solar, sky: { condition: "sunny", isDay: false, cloudCoverage: 0, raw: "clear-night" } }} />,
    );
    expect(container.querySelector('[data-sky="sunny-night"]')).toBeTruthy();
    expect(container.querySelectorAll(".wx-star").length).toBeGreaterThan(0);
  });

  it("labels the card with the localized weather condition", () => {
    render(<SolarCard solar={{ ...solar, sky: { condition: "rain", isDay: true, cloudCoverage: 80, raw: "rainy" } }} />);
    expect(screen.getByLabelText(/Zonnepanelen — Regen/i)).toBeInTheDocument();
  });
});
