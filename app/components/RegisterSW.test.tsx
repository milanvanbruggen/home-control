import { describe, it, expect, vi, afterEach } from "vitest";
import { render } from "@testing-library/react";
import { RegisterSW } from "@/app/components/RegisterSW";

afterEach(() => vi.unstubAllGlobals());

describe("RegisterSW", () => {
  it("registers the service worker when supported", () => {
    const register = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { serviceWorker: { register } });
    render(<RegisterSW />);
    expect(register).toHaveBeenCalledWith("/sw.js");
  });

  it("does nothing when service workers are unsupported", () => {
    vi.stubGlobal("navigator", {});
    expect(() => render(<RegisterSW />)).not.toThrow();
  });
});
