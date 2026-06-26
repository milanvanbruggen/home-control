import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import type { ReactElement } from "react";
import SettingsPage from "@/app/settings/page";
import { ThemeProvider } from "@/app/components/ThemeProvider";
import { LanguageProvider } from "@/app/components/LanguageProvider";

const rooms = [
  {
    key: "woonkamer", name: "Woonkamer", lightId: "light.woonkamer", on: true, brightness: 40,
    scenes: [
      { id: "scene.woonkamer_a", name: "Scene A" },
      { id: "scene.woonkamer_b", name: "Scene B" },
    ],
    favorites: ["scene.woonkamer_a"],
    activeScene: null,
  },
];

const metrics = [
  { key: "woonkamer", name: "Woonkamer", metrics: [
    { kind: "temperature", value: 21.4, unit: "°C", visible: true },
    { kind: "humidity", value: 48, unit: "%", visible: true },
  ] },
];

let fetchMock: ReturnType<typeof vi.fn>;

function fetchImpl(url: string) {
  if (url === "/api/state") {
    return Promise.resolve({ ok: true, json: () => Promise.resolve({ rooms, metrics }) });
  }
  return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
}

function wrap(ui: ReactElement) {
  return (
    <ThemeProvider initial="system">
      <LanguageProvider initial="en">{ui}</LanguageProvider>
    </ThemeProvider>
  );
}

function settingsPut(theme?: string) {
  return fetchMock.mock.calls.find(
    (c) => c[0] === "/api/settings" && c[1]?.method === "PUT" && (theme === undefined || JSON.parse(c[1].body).theme === theme),
  );
}

describe("SettingsPage", () => {
  beforeEach(() => {
    document.documentElement.classList.remove("dark");
    vi.stubGlobal("matchMedia", vi.fn().mockReturnValue({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
    fetchMock = vi.fn((url: string) => fetchImpl(url));
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  it("renders the three sections and the room's scenes (English default)", async () => {
    render(wrap(<SettingsPage />));
    expect(screen.getByText("Language")).toBeInTheDocument();
    expect(screen.getByText("Theme")).toBeInTheDocument();
    expect(screen.getByText("Favorite scenes")).toBeInTheDocument();
    // woonkamer is open by default → both scenes visible
    expect(await screen.findByRole("button", { name: /Scene A/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Scene B/ })).toBeInTheDocument();
  });

  it("shows the notifications toggle and a test button", async () => {
    render(wrap(<SettingsPage />));
    expect(screen.getByText("Notifications")).toBeInTheDocument();
    expect(await screen.findByRole("switch", { name: "Water reservoir alert" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Send test" })).toBeInTheDocument();
  });

  it("toggling the water alert PUTs waterAlert", async () => {
    render(wrap(<SettingsPage />));
    const sw = await screen.findByRole("switch", { name: "Water reservoir alert" });
    fireEvent.click(sw);
    await waitFor(() => {
      const call = fetchMock.mock.calls.find(
        (c) => c[0] === "/api/settings" && c[1]?.method === "PUT" && "waterAlert" in JSON.parse(c[1].body),
      );
      expect(call).toBeTruthy();
    });
  });

  it("Send test POSTs /api/notify-test", async () => {
    render(wrap(<SettingsPage />));
    fireEvent.click(screen.getByRole("button", { name: "Send test" }));
    await waitFor(() => {
      expect(
        fetchMock.mock.calls.find((c) => c[0] === "/api/notify-test" && c[1]?.method === "POST"),
      ).toBeTruthy();
    });
  });

  it("selecting a theme persists it to /api/settings", async () => {
    render(wrap(<SettingsPage />));
    fireEvent.click(screen.getByRole("radio", { name: "Dark" }));
    await waitFor(() => expect(settingsPut("dark")).toBeTruthy());
    expect(document.documentElement.classList.contains("dark")).toBe(true);
  });

  it("toggling a favorite PUTs the full favorites map", async () => {
    render(wrap(<SettingsPage />));
    const sceneB = await screen.findByRole("button", { name: /Scene B/ });
    expect(sceneB).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(sceneB);
    expect(sceneB).toHaveAttribute("aria-pressed", "true");
    await waitFor(() => {
      const call = fetchMock.mock.calls.find((c) => c[0] === "/api/settings" && c[1]?.method === "PUT" && JSON.parse(c[1].body).favorites);
      expect(call).toBeTruthy();
      expect(JSON.parse(call![1].body).favorites.woonkamer).toEqual(["scene.woonkamer_a", "scene.woonkamer_b"]);
    });
  });

  it("renders the Widgets section; a metric row expands to a switch per metric", async () => {
    render(wrap(<SettingsPage />));
    expect(await screen.findByText("Widgets")).toBeInTheDocument();
    // The metric card's readings are hidden until its row is expanded.
    fireEvent.click(await screen.findByRole("button", { name: "Woonkamer" }));
    expect(await screen.findByRole("switch", { name: "Woonkamer Temperature" })).toBeInTheDocument();
    expect(screen.getByRole("switch", { name: "Woonkamer Humidity" })).toBeInTheDocument();
  });

  it("toggling a metric off PUTs the hiddenMetrics deny-list", async () => {
    render(wrap(<SettingsPage />));
    fireEvent.click(await screen.findByRole("button", { name: "Woonkamer" })); // expand the metric row
    fireEvent.click(await screen.findByRole("switch", { name: "Woonkamer Humidity" }));
    await waitFor(() => {
      const call = fetchMock.mock.calls.find(
        (c) => c[0] === "/api/settings" && c[1]?.method === "PUT" && JSON.parse(c[1].body).hiddenMetrics,
      );
      expect(call).toBeTruthy();
      expect(JSON.parse(call![1].body).hiddenMetrics.woonkamer).toEqual(["humidity"]);
    });
  });

  it("saves the consumption (afname) price in simple mode", async () => {
    render(wrap(<SettingsPage />));
    const input = await screen.findByLabelText(/Consumption price/i);
    fireEvent.change(input, { target: { value: "0,25" } });
    fireEvent.blur(input);
    await waitFor(() => {
      const put = fetchMock.mock.calls.find((c) => c[0] === "/api/settings" && c[1]?.method === "PUT" && JSON.parse(c[1].body).tariff);
      expect(put).toBeTruthy();
      const tariff = JSON.parse(put![1].body).tariff;
      expect(tariff.mode).toBe("simple");
      expect(tariff.importPrice).toBe(0.25);
    });
  });

  it("switches to advanced mode and saves a dual-tariff field", async () => {
    render(wrap(<SettingsPage />));
    fireEvent.click(await screen.findByRole("radio", { name: "Advanced" }));
    const low = await screen.findByLabelText(/Off-peak price/i);
    fireEvent.change(low, { target: { value: "0,22216" } });
    fireEvent.blur(low);
    await waitFor(() => {
      const puts = fetchMock.mock.calls.filter((c) => c[0] === "/api/settings" && c[1]?.method === "PUT" && JSON.parse(c[1].body).tariff?.mode === "advanced");
      const put = puts.at(-1);
      expect(put).toBeTruthy();
      expect(JSON.parse(put![1].body).tariff.importLow).toBe(0.22216);
    });
  });
});
