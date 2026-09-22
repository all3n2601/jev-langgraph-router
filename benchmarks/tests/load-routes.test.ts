import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { routes } from "../src/dataset.js";
import { loadRouteMap } from "../src/load-routes.js";

async function fixture(value: string): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "jev-route-map-test-"));
  const path = join(directory, "routes.json");
  await writeFile(path, value);
  return path;
}

describe("workflow route map", () => {
  it("accepts one frozen description per route", async () => {
    await expect(loadRouteMap(await fixture(JSON.stringify(routes)))).resolves.toEqual(routes);
  });

  it.each(["{", "null", "[]", JSON.stringify({ answer: "Only one route" })])(
    "rejects an invalid route file",
    async (value) => {
      await expect(loadRouteMap(await fixture(value))).rejects.toThrow();
    },
  );
});
