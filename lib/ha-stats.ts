export interface StatPoint {
  start: number;
  end: number;
  change: number | null;
}

export interface WSLike {
  send(data: string): void;
  close(): void;
  onopen: ((ev?: unknown) => void) | null;
  onmessage: ((ev: { data: string }) => void) | null;
  onerror: ((ev: unknown) => void) | null;
}
type Connect = (url: string) => WSLike;

function wsBaseUrl(): string {
  const url = process.env.HA_URL || (process.env.SUPERVISOR_TOKEN ? "http://supervisor/core" : undefined);
  if (!url) throw new Error("HA_URL not configured");
  return url.replace(/\/$/, "").replace(/^http/, "ws") + "/api/websocket";
}
function authToken(): string {
  const t = process.env.HA_TOKEN || process.env.SUPERVISOR_TOKEN;
  if (!t) throw new Error("HA_TOKEN not configured");
  return t;
}

/** Read HA long-term statistics (`recorder/statistics_during_period`) over a single
 *  short-lived WebSocket connection. Returns each id's `change` points. */
export function getStatistics(
  ids: string[],
  startISO: string,
  endISO: string,
  period: "hour" | "day" | "month",
  opts: { connect?: Connect; timeoutMs?: number } = {},
): Promise<Record<string, StatPoint[]>> {
  const connect: Connect = opts.connect ?? ((url) => new WebSocket(url) as unknown as WSLike);
  const ws = connect(wsBaseUrl());
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => finish(() => reject(new Error("statistics timeout"))), opts.timeoutMs ?? 20000);
    function finish(fn: () => void) {
      clearTimeout(timer);
      try { ws.close(); } catch { /* ignore */ }
      fn();
    }
    ws.onerror = () => finish(() => reject(new Error("statistics ws error")));
    ws.onmessage = (ev) => {
      let m: { type?: string; success?: boolean; result?: Record<string, Array<{ start: number; end: number; change?: number | null }>> };
      try { m = JSON.parse(ev.data); } catch { return; }
      if (m.type === "auth_required") {
        ws.send(JSON.stringify({ type: "auth", access_token: authToken() }));
        return;
      }
      if (m.type === "auth_invalid") { finish(() => reject(new Error("statistics auth invalid"))); return; }
      if (m.type === "auth_ok") {
        ws.send(JSON.stringify({ id: 1, type: "recorder/statistics_during_period", start_time: startISO, end_time: endISO, period, statistic_ids: ids, types: ["change"] }));
        return;
      }
      if (m.type === "result") {
        if (!m.success) { finish(() => reject(new Error("statistics request failed"))); return; }
        const out: Record<string, StatPoint[]> = {};
        const r = m.result ?? {};
        for (const id of Object.keys(r)) {
          out[id] = r[id].map((p) => ({ start: p.start, end: p.end, change: p.change ?? null }));
        }
        finish(() => resolve(out));
      }
    };
  });
}
