import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { LanguageProvider, useT, useLang } from "@/app/components/LanguageProvider";

function Probe() {
  const tr = useT();
  const { setLang } = useLang();
  return (
    <div>
      <span>{tr("lights.allScenes")}</span>
      <button onClick={() => setLang("nl")}>switch</button>
    </div>
  );
}

describe("LanguageProvider", () => {
  beforeEach(() => {
    (globalThis as unknown as { fetch: unknown }).fetch = vi.fn(() => Promise.resolve({ ok: true }));
  });

  it("useT falls back to English without a provider", () => {
    render(<Probe />);
    expect(screen.getByText("All scenes")).toBeInTheDocument();
  });

  it("switching the language re-renders translated text and persists to /api/settings", () => {
    render(
      <LanguageProvider initial="en">
        <Probe />
      </LanguageProvider>,
    );
    expect(screen.getByText("All scenes")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "switch" }));
    expect(screen.getByText("Alle scenes")).toBeInTheDocument();
    expect((globalThis as unknown as { fetch: ReturnType<typeof vi.fn> }).fetch).toHaveBeenCalledWith(
      "/api/settings",
      expect.objectContaining({ method: "PUT" }),
    );
  });
});
