import fs from "node:fs";
import path from "node:path";
import { dataFile } from "@/lib/data-dir";
import { appendAndPrune, type MetricHistory, type MetricSample } from "@/lib/metrics-history";

// Server-only: rolling metric history as JSON on the writable data volume.
const FILE = "metrics-history.json";

export function readHistory(): MetricHistory {
  try {
    const raw = JSON.parse(fs.readFileSync(dataFile(FILE), "utf8")) as unknown;
    if (raw && typeof raw === "object" && Array.isArray((raw as MetricHistory).samples)) {
      return { samples: (raw as MetricHistory).samples };
    }
    return { samples: [] };
  } catch {
    return { samples: [] };
  }
}

export function writeSample(sample: MetricSample, now: number): void {
  const next = appendAndPrune(readHistory(), sample, now);
  const file = dataFile(FILE);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(next), "utf8");
  fs.renameSync(tmp, file);
}
