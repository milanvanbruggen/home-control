import fs from "node:fs";
import path from "node:path";

// Server-only: the writable directory for app state. The HA add-on mounts a
// persistent /data volume; in dev we fall back to a project-local .data dir.
// Override with DATA_DIR (used by tests).
export function dataDir(): string {
  if (process.env.DATA_DIR) return process.env.DATA_DIR;
  try {
    fs.accessSync("/data", fs.constants.W_OK);
    return "/data";
  } catch {
    return path.join(process.cwd(), ".data");
  }
}

export function dataFile(name: string): string {
  return path.join(dataDir(), name);
}
