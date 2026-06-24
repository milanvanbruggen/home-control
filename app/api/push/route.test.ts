import { describe, it, expect, vi, beforeEach } from "vitest";

const store = vi.hoisted(() => ({
  getVapidPublicKey: vi.fn(() => "PUBKEY"),
  addSubscription: vi.fn(),
  removeSubscription: vi.fn(),
}));
vi.mock("@/lib/push-store", () => store);

import { GET } from "@/app/api/push/route";
import { POST as subscribe } from "@/app/api/push/subscribe/route";
import { POST as unsubscribe } from "@/app/api/push/unsubscribe/route";

function post(url: string, body: unknown): Request {
  return new Request(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("push API", () => {
  beforeEach(() => vi.clearAllMocks());

  it("GET returns the VAPID public key", async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ publicKey: "PUBKEY" });
  });

  it("subscribe stores a valid subscription", async () => {
    const sub = { endpoint: "https://push/1", keys: { p256dh: "p", auth: "a" } };
    const res = await subscribe(post("http://localhost/api/push/subscribe", sub));
    expect(res.status).toBe(200);
    expect(store.addSubscription).toHaveBeenCalledWith(sub);
  });

  it("subscribe rejects a malformed body with 400", async () => {
    const res = await subscribe(post("http://localhost/api/push/subscribe", { endpoint: "not-a-url" }));
    expect(res.status).toBe(400);
    expect(store.addSubscription).not.toHaveBeenCalled();
  });

  it("unsubscribe removes by endpoint", async () => {
    const res = await unsubscribe(post("http://localhost/api/push/unsubscribe", { endpoint: "https://push/1" }));
    expect(res.status).toBe(200);
    expect(store.removeSubscription).toHaveBeenCalledWith("https://push/1");
  });
});
