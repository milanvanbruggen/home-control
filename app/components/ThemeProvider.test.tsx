import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { ThemeProvider, useTheme } from "@/app/components/ThemeProvider";

function Probe() {
  const { theme, setTheme } = useTheme();
  return <button onClick={() => setTheme("dark")}>theme:{theme}</button>;
}

describe("ThemeProvider", () => {
  beforeEach(() => {
    document.documentElement.classList.remove("dark");
    vi.stubGlobal("matchMedia", vi.fn().mockReturnValue({
      matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn(),
    }));
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    document.documentElement.classList.remove("dark");
  });

  it("applies the dark class for initial='dark'", () => {
    render(<ThemeProvider initial="dark"><span>x</span></ThemeProvider>);
    expect(document.documentElement.classList.contains("dark")).toBe(true);
  });

  it("setTheme('dark') toggles the class and PUTs to /api/settings", () => {
    render(<ThemeProvider initial="light"><Probe /></ThemeProvider>);
    expect(document.documentElement.classList.contains("dark")).toBe(false);
    act(() => { fireEvent.click(screen.getByRole("button")); });
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(fetch).toHaveBeenCalledWith("/api/settings", expect.objectContaining({ method: "PUT" }));
  });
});
