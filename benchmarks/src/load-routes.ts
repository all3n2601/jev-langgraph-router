import { readFile } from "node:fs/promises";
import { routes, type BenchmarkRouteMap, type Route } from "./dataset.js";

/** Validate a frozen, workflow-specific description for every supported next action. */
export async function loadRouteMap(path: string): Promise<BenchmarkRouteMap> {
  let value: unknown;
  try {
    value = JSON.parse(await readFile(path, "utf8"));
  } catch {
    throw new Error("Route map must be a readable JSON object");
  }
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("Route map must be an object");
  }
  const record = value as Record<string, unknown>;
  const names = Object.keys(routes) as Route[];
  if (
    Object.keys(record).length !== names.length ||
    names.some(
      (name) =>
        typeof record[name] !== "string" ||
        (record[name] as string).trim().length === 0 ||
        (record[name] as string).length > 1_000,
    )
  ) {
    throw new Error("Route map must describe exactly answer, search, calculate, and human");
  }
  return record as unknown as BenchmarkRouteMap;
}
