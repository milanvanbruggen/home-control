import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { usePolling } from "@/app/hooks/usePolling";

describe("usePolling", () => {
  beforeEach(() => vi.stubGlobal("fetch", vi.fn()));
  afterEach(() => vi.unstubAllGlobals());

  it("fetches state and marks connected", async () => {
    (fetch as any).mockResolvedValue({ ok: true, json: async () => ({ chills: [], thermostat: null, scenes: [] }) });
    const { result } = renderHook(() => usePolling(10_000));
    await waitFor(() => expect(result.current.state).not.toBeNull());
    expect(result.current.connected).toBe(true);
    expect(result.current.state?.chills).toEqual([]);
  });

  it("marks disconnected when the fetch fails", async () => {
    (fetch as any).mockRejectedValue(new Error("network"));
    const { result } = renderHook(() => usePolling(10_000));
    await waitFor(() => expect(result.current.connected).toBe(false));
  });
});
