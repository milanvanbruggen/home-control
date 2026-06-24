import fs from "node:fs";
import path from "node:path";
import webpush from "web-push";
import { dataFile } from "@/lib/data-dir";

// Server-only: VAPID keys + Web Push subscriptions, persisted on the data volume.

export interface PushSubscriptionRecord {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

interface VapidKeys {
  publicKey: string;
  privateKey: string;
}

const SUBJECT = "mailto:info@milanvanbruggen.nl";

let vapidCache: VapidKeys | null = null;
let configured = false;

function writeJson(file: string, value: unknown): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(value, null, 2), "utf8");
  fs.renameSync(tmp, file);
}

function readJson<T>(file: string): T | null {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8")) as T;
  } catch {
    return null;
  }
}

/** Load VAPID keys from env, else a stored file, else generate + persist them. */
function loadVapid(): VapidKeys {
  if (vapidCache) return vapidCache;
  if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
    vapidCache = { publicKey: process.env.VAPID_PUBLIC_KEY, privateKey: process.env.VAPID_PRIVATE_KEY };
    return vapidCache;
  }
  const file = dataFile("vapid.json");
  const stored = readJson<VapidKeys>(file);
  if (stored?.publicKey && stored?.privateKey) {
    vapidCache = stored;
    return vapidCache;
  }
  const generated = webpush.generateVAPIDKeys();
  vapidCache = { publicKey: generated.publicKey, privateKey: generated.privateKey };
  try {
    writeJson(file, vapidCache);
  } catch {
    // read-only fs: keep the in-memory keys for this process
  }
  return vapidCache;
}

function ensureConfigured(): VapidKeys {
  const keys = loadVapid();
  if (!configured) {
    webpush.setVapidDetails(SUBJECT, keys.publicKey, keys.privateKey);
    configured = true;
  }
  return keys;
}

export function getVapidPublicKey(): string {
  return ensureConfigured().publicKey;
}

function subsFile(): string {
  return dataFile("push-subscriptions.json");
}

export function listSubscriptions(): PushSubscriptionRecord[] {
  return readJson<PushSubscriptionRecord[]>(subsFile()) ?? [];
}

function saveSubscriptions(subs: PushSubscriptionRecord[]): void {
  writeJson(subsFile(), subs);
}

export function addSubscription(sub: PushSubscriptionRecord): void {
  const subs = listSubscriptions().filter((s) => s.endpoint !== sub.endpoint);
  subs.push(sub);
  saveSubscriptions(subs);
}

export function removeSubscription(endpoint: string): void {
  const subs = listSubscriptions().filter((s) => s.endpoint !== endpoint);
  saveSubscriptions(subs);
}

export interface PushPayload {
  title: string;
  body: string;
  tag?: string;
  url?: string;
}

/** Send a notification to every stored subscription; prune ones that are gone (404/410). */
export async function sendPushToAll(payload: PushPayload): Promise<number> {
  ensureConfigured();
  const subs = listSubscriptions();
  if (subs.length === 0) return 0;
  const body = JSON.stringify(payload);
  const stale: string[] = [];
  let sent = 0;
  await Promise.all(
    subs.map(async (sub) => {
      try {
        await webpush.sendNotification(sub as webpush.PushSubscription, body);
        sent += 1;
      } catch (e) {
        const status = (e as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) stale.push(sub.endpoint);
        // other errors are swallowed (transient / device offline)
      }
    }),
  );
  if (stale.length) saveSubscriptions(subs.filter((s) => !stale.includes(s.endpoint)));
  return sent;
}

/** Test helper. */
export function _resetPushCache(): void {
  vapidCache = null;
  configured = false;
}
