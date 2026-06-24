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

let fetchMock: ReturnType<typeof vi.fn>;

function fetchImpl(url: string) {
  if (url === "/api/state") {
    return Promise.resolve({ ok: true, json: () => Promise.resolve({ rooms }) });
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
});
