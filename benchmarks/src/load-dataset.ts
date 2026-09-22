import { readFile } from "node:fs/promises";
import { routes, type BenchmarkCase } from "./dataset.js";

/** Load user-supplied, human-reviewed cases without printing or logging their text. */
export async function loadJsonlDataset(path: string): Promise<readonly BenchmarkCase[]> {
  const text = await readFile(path, "utf8");
  const lines = text.split(/\r?\n/).filter((line) => line.trim().length > 0);
  if (lines.length === 0 || lines.length > 10_000) {
    throw new Error("Dataset must contain between 1 and 10,000 cases");
  }
  const seen = new Set<string>();
  return lines.map((line, index) => {
    let value: unknown;
    try {
      value = JSON.parse(line);
    } catch {
      throw new Error(`Invalid JSON on dataset line ${index + 1}`);
    }
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
      throw new Error(`Invalid case on dataset line ${index + 1}`);
    }
    const row = value as Record<string, unknown>;
    if (
      typeof row.id !== "string" ||
      !/^[a-zA-Z0-9_-]{1,80}$/.test(row.id) ||
      typeof row.input !== "string" ||
      row.input.trim().length === 0 ||
      row.input.length > 10_000 ||
      typeof row.label !== "string" ||
      !Object.hasOwn(routes, row.label) ||
      (row.split !== "calibration" && row.split !== "test")
    ) {
      throw new Error(`Invalid fields on dataset line ${index + 1}`);
    }
    if (seen.has(row.id)) throw new Error(`Duplicate case ID on dataset line ${index + 1}`);
    seen.add(row.id);
    return {
      id: row.id,
      input: row.input,
      label: row.label,
      split: row.split,
    } as BenchmarkCase;
  });
}
