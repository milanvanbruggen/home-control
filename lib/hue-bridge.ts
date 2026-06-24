import https from "node:https";
import { xyBriToRgb, mirekToRgb, actionsToGradient, sceneKey } from "@/lib/hue-color";

// Server-only: read real per-scene colors from the Hue Bridge (API v2) and build
// a `"<room>|<scene>" -> CSS gradient` map. Env-gated + TLS-relaxed (the bridge
// uses a self-signed cert) + TTL-cached (stale-while-revalidate). Any failure
// degrades to the last good map / an empty map so callers just fall back.

const TTL_MS = 10 * 60 * 1000;

type HueResp = { data?: Array<Record<string, unknown>> };
type Fetcher = (host: string, pathname: string, key: string) => Promise<HueResp>;

function bridge(): { ip: string; key: string } | null {
  const ip = process.env.HUE_BRIDGE_IP;
  const key = process.env.HUE_APP_KEY;
  return ip && key ? { ip, key } : null;
}

/** GET a bridge resource over HTTPS, ignoring its self-signed cert. */
const httpsFetcher: Fetcher = (host, pathname, key) =>
  new Promise((resolve, reject) => {
    const req = https.request(
      { host, path: pathname, method: "GET", rejectUnauthorized: false, timeout: 4000, headers: { "hue-application-key": key } },
      (res) => {
        let data = "";
        res.on("data", (c) => (data += c));
        res.on("end", () => {
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            reject(e);
          }
        });
      },
    );
    req.on("error", reject);
    req.on("timeout", () => req.destroy(new Error("hue timeout")));
    req.end();
  });

let fetcher: Fetcher = httpsFetcher;

/** Pure: assemble the room+scene resources into the `"<room>|<scene>" -> gradient` map. */
export function buildGradientMap(rooms: HueResp, scenes: HueResp): Record<string, string> {
  const roomName: Record<string, string> = {};
  for (const r of rooms.data ?? []) {
    const meta = r.metadata as { name?: string } | undefined;
    if (typeof r.id === "string" && meta?.name) roomName[r.id] = meta.name;
  }
  const map: Record<string, string> = {};
  for (const sc of scenes.data ?? []) {
    const group = sc.group as { rid?: string } | undefined;
    const meta = sc.metadata as { name?: string } | undefined;
    const room = group?.rid ? roomName[group.rid] : undefined;
    if (!room || !meta?.name) continue;
    const colors: string[] = [];
    for (const a of (sc.actions as Array<{ action?: Record<string, any> }>) ?? []) {
      const act = a.action ?? {};
      if (act.on && act.on.on === false) continue;
      const bri = act.dimming?.brightness ?? 100;
      if (act.color?.xy) colors.push(xyBriToRgb(act.color.xy.x, act.color.xy.y, bri));
      else if (act.color_temperature?.mirek) colors.push(mirekToRgb(act.color_temperature.mirek));
    }
    const gradient = actionsToGradient(colors);
    if (gradient) map[sceneKey(room, meta.name)] = gradient;
  }
  return map;
}

let cache: Record<string, string> = {};
let fetchedAt = 0;
let inflight: Promise<void> | null = null;

async function refresh(): Promise<void> {
  const b = bridge();
  if (!b) {
    cache = {};
    fetchedAt = Date.now();
    return;
  }
  try {
    const [rooms, scenes] = await Promise.all([
      fetcher(b.ip, "/clip/v2/resource/room", b.key),
      fetcher(b.ip, "/clip/v2/resource/scene", b.key),
    ]);
    cache = buildGradientMap(rooms, scenes);
    fetchedAt = Date.now();
  } catch {
    // keep the last good cache; mark the attempt so we back off until the TTL.
    fetchedAt = Date.now();
  }
}

/** Cached `"<room>|<scene>" -> gradient` map. First call fetches inline; later
 *  calls serve the cache and refresh in the background once stale. */
export async function getSceneGradients(): Promise<Record<string, string>> {
  if (!bridge()) return {};
  if (fetchedAt === 0) {
    inflight ??= refresh().finally(() => {
      inflight = null;
    });
    await inflight;
  } else if (Date.now() - fetchedAt > TTL_MS && !inflight) {
    inflight = refresh().finally(() => {
      inflight = null;
    });
  }
  return cache;
}

/** Test hooks. */
export function _setHueFetcher(f: Fetcher | null): void {
  fetcher = f ?? httpsFetcher;
}
export function _resetHueCache(): void {
  cache = {};
  fetchedAt = 0;
  inflight = null;
}
