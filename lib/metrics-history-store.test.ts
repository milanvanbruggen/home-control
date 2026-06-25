import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { readHistory, writeSample } from "@/lib/metrics-history-store";
import { RETENTION_MS } from "@/lib/metrics-history";

let dir: string;
let n = 0;
const NOW = 1_700_000_000_000;

beforeEach(() => {
  dir = path.join(os.tmpdir(), `metrics-hist-${process.pid}-${n++}`);
  fs.mkdirSync(dir, { recursive: true });
  process.env.DATA_DIR = dir;
});
afterEach(() => {
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ }
  delete process.env.DATA_DIR;
});

describe("metrics-history-store", () => {
  it("returns empty history when no file exists", () => {
    expect(readHistory()).toEqual({ samples: [] });
  });

  it("writes a sample and reads it back, pruning >30d", () => {
    writeSample({ t: NOW - RETENTION_MS - 1, v: { "woonkamer.temperature": 9 } }, NOW - RETENTION_MS - 1);
    writeSample({ t: NOW, v: { "woonkamer.temperature": 21.4 } }, NOW);
    const h = readHistory();
    expect(h.samples.map((s) => s.t)).toEqual([NOW]); // old one pruned on the second write
    expect(h.samples[0].v["woonkamer.temperature"]).toBe(21.4);
  });

  it("treats a corrupt file as empty", () => {
    fs.writeFileSync(path.join(dir, "metrics-history.json"), "{not json");
    expect(readHistory()).toEqual({ samples: [] });
  });
});
