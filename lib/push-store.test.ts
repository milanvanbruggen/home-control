import { describe, it, expect, vi, beforeEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const sendNotification = vi.fn();
vi.mock("web-push", () => ({
  default: {
    generateVAPIDKeys: () => ({ publicKey: "PUBKEY", privateKey: "PRIVKEY" }),
    setVapidDetails: vi.fn(),
    sendNotification,
  },
}));

let dir: string;

beforeEach(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "push-"));
  process.env.DATA_DIR = dir;
  delete process.env.VAPID_PUBLIC_KEY;
  delete process.env.VAPID_PRIVATE_KEY;
  sendNotification.mockReset();
  const { _resetPushCache } = await import("@/lib/push-store");
  _resetPushCache();
});

describe("push-store", () => {
  it("generates and persists VAPID keys", async () => {
    const { getVapidPublicKey } = await import("@/lib/push-store");
    expect(getVapidPublicKey()).toBe("PUBKEY");
    const stored = JSON.parse(fs.readFileSync(path.join(dir, "vapid.json"), "utf8"));
    expect(stored.publicKey).toBe("PUBKEY");
  });

  it("adds (de-duping by endpoint), lists and removes subscriptions", async () => {
    const m = await import("@/lib/push-store");
    const sub = { endpoint: "https://push/1", keys: { p256dh: "p", auth: "a" } };
    m.addSubscription(sub);
    m.addSubscription({ ...sub, keys: { p256dh: "p2", auth: "a2" } }); // same endpoint
    expect(m.listSubscriptions()).toHaveLength(1);
    m.addSubscription({ endpoint: "https://push/2", keys: { p256dh: "p", auth: "a" } });
    expect(m.listSubscriptions()).toHaveLength(2);
    m.removeSubscription("https://push/1");
    expect(m.listSubscriptions().map((s) => s.endpoint)).toEqual(["https://push/2"]);
  });

  it("sendPushToAll prunes subscriptions that are gone (410)", async () => {
    const m = await import("@/lib/push-store");
    m.addSubscription({ endpoint: "https://gone", keys: { p256dh: "p", auth: "a" } });
    m.addSubscription({ endpoint: "https://ok", keys: { p256dh: "p", auth: "a" } });
    sendNotification.mockImplementation((sub: { endpoint: string }) =>
      sub.endpoint === "https://gone" ? Promise.reject({ statusCode: 410 }) : Promise.resolve(),
    );
    const sent = await m.sendPushToAll({ title: "t", body: "b" });
    expect(sent).toBe(1);
    expect(m.listSubscriptions().map((s) => s.endpoint)).toEqual(["https://ok"]);
  });
});
