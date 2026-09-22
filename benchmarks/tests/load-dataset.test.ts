import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { loadJsonlDataset } from "../src/load-dataset.js";

async function fixture(lines: readonly string[]): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "jev-dataset-test-"));
  const path = join(directory, "cases.jsonl");
  await writeFile(path, `${lines.join("\n")}\n`);
  return path;
}

const valid = JSON.stringify({
  id: "case-1",
  input: "Find today's weather",
  label: "search",
  split: "test",
});

describe("external benchmark dataset loader", () => {
  it("accepts labeled JSONL and keeps only the defined fields", async () => {
    const path = await fixture([valid]);
    await expect(loadJsonlDataset(path)).resolves.toEqual([
      { id: "case-1", input: "Find today's weather", label: "search", split: "test" },
    ]);
  });

  it.each([
    ["empty", []],
    ["bad JSON", ["{"]],
    ["not an object", ["null"]],
    ["bad route", [valid.replace('"search"', '"other"')]],
    ["bad split", [valid.replace('"test"', '"unknown"')]],
    ["duplicate ID", [valid, valid]],
  ])("rejects %s without printing case text", async (_name, lines) => {
    const path = await fixture(lines);
    await expect(loadJsonlDataset(path)).rejects.toThrow();
  });
});
