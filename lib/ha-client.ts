import type { HaEntityState } from "@/lib/types";

export class HaError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "HaError";
    this.status = status;
  }
}

function baseUrl(): string {
  const url = process.env.HA_URL;
  if (!url) throw new HaError("HA_URL not configured", 503);
  return url.replace(/\/$/, "");
}

function authHeader(): string {
  const token = process.env.HA_TOKEN;
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
