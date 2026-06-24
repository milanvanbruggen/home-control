import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/ha-client", () => {
  class HaError extends Error {
    status: number;
    constructor(m: string, s: number) {
      super(m);
      this.status = s;
    }
  }
  return {
    callService: vi.fn(),
    HaError,
    statusForError: (e: unknown) => (e instanceof HaError ? 502 : 500),
  };
});

import { callService } from "@/lib/ha-client";
import { _resetSettingsCache } from "@/lib/settings-store";
import { POST } from "@/app/api/notify-test/route";

describe("POST /api/notify-test", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (callService as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
    process.env.SETTINGS_PATH = "/tmp/nonexistent-notify-test-settings.json";
    _resetSettingsCache();
  });

  it("fires a LaMetric test notification", async () => {
    const res = await POST();
    expect(res.status).toBe(200);
    expect(callService).toHaveBeenCalledWith(
      "notify",
      "my_lametric",
      expect.objectContaining({
        message: expect.any(String),
        data: expect.objectContaining({ sound: "alarm13" }),
      }),
    );
  });

  it("returns 502 when the HA call fails", async () => {
    const { HaError } = await import("@/lib/ha-client");
    (callService as ReturnType<typeof vi.fn>).mockRejectedValue(new HaError("fail", 502));
    expect((await POST()).status).toBe(502);
  });
});
