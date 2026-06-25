import type { HaEntityState } from "@/lib/types";

export class HaError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "HaError";
    this.status = status;
  }
}

// When running as a Home Assistant add-on (homeassistant_api: true), the
// Supervisor injects SUPERVISOR_TOKEN and proxies the core API at
// http://supervisor/core — no manually configured HA_URL/HA_TOKEN needed.
// Explicit HA_URL/HA_TOKEN (dev / standalone Docker) take precedence.
function baseUrl(): string {
  const url = process.env.HA_URL || (process.env.SUPERVISOR_TOKEN ? "http://supervisor/core" : undefined);
  if (!url) throw new HaError("HA_URL not configured", 503);
  return url.replace(/\/$/, "");
}

function authHeader(): string {
  const token = process.env.HA_TOKEN || process.env.SUPERVISOR_TOKEN;
  if (!token) throw new HaError("HA_TOKEN not configured", 503);
  return `Bearer ${token}`;
}

export async function getStates(): Promise<HaEntityState[]> {
  const res = await fetch(`${baseUrl()}/api/states`, {
    headers: { Authorization: authHeader() },
    cache: "no-store",
  });
  if (!res.ok) throw new HaError(`HA /api/states failed: ${res.status}`, res.status);
  return (await res.json()) as HaEntityState[];
}

export async function callService(
  domain: string,
  service: string,
  data: Record<string, unknown>,
): Promise<void> {
  const res = await fetch(`${baseUrl()}/api/services/${domain}/${service}`, {
    method: "POST",
    headers: { Authorization: authHeader(), "Content-Type": "application/json" },
    body: JSON.stringify(data),
    cache: "no-store",
  });
  if (!res.ok) throw new HaError(`HA ${domain}.${service} failed: ${res.status}`, res.status);
}

export interface HaHistoryState {
  state: string;
  last_changed: string;
}

/**
 * Lees HA's eigen geschiedenis voor één entity over [startISO, endISO].
 * Gebruikt minimal_response/no_attributes/significant_changes_only om de payload
 * klein te houden. Retourneert de (chronologische) statuslijst, of [] bij leeg.
 */
export async function getHistory(
  entityId: string,
  startISO: string,
  endISO: string,
): Promise<HaHistoryState[]> {
  const qs =
    `filter_entity_id=${encodeURIComponent(entityId)}` +
    `&end_time=${encodeURIComponent(endISO)}` +
    `&minimal_response&no_attributes&significant_changes_only`;
  const res = await fetch(`${baseUrl()}/api/history/period/${encodeURIComponent(startISO)}?${qs}`, {
    headers: { Authorization: authHeader() },
    cache: "no-store",
  });
  if (!res.ok) throw new HaError(`HA history failed: ${res.status}`, res.status);
  const data = (await res.json()) as Array<Array<{ state: string; last_changed: string }>>;
  return (data[0] ?? []).map((s) => ({ state: s.state, last_changed: s.last_changed }));
}

/**
 * Map a thrown error to the client-facing HTTP status:
 * 503 for configuration/auth problems (missing env, or 401/403 from HA),
 * 502 for other upstream HA failures, 500 for anything unexpected.
 */
export function statusForError(e: unknown): number {
  if (e instanceof HaError) {
    return e.status === 503 || e.status === 401 || e.status === 403 ? 503 : 502;
  }
  return 500;
}
