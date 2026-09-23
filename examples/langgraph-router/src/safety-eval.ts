import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { RouteDecision } from "jev-router-core";
import { createDemoGraph, type Route } from "./graph.js";

// This evaluates the example's already-declared 0.8 probability / 0.6 confidence
// thresholds. It does not tune thresholds against the held-out labels.
if (!process.argv.includes("--live")) throw new Error("Pass --live to authorize API calls");
if (!process.env.TYPESAFE_API_KEY?.trim()) throw new Error("TYPESAFE_API_KEY is required");

const datasetPath = resolve(
  "benchmarks/results/raw/bitext-retail-ecommerce-v1/provisional-cases.jsonl",
);
const routePath = resolve("benchmarks/datasets/postpurchase-support-v1/routes.json");
const datasetText = await readFile(datasetPath, "utf8");
const routeText = await readFile(routePath, "utf8");
const cases = datasetText
  .split(/\r?\n/)
  .filter((line) => line.trim())
  .map((line) => JSON.parse(line) as { id: string; input: string; split: string; label: Route })
  .filter((row) => row.split === "test");
if (cases.length !== 96 || new Set(cases.map((row) => row.id)).size !== 96) {
  throw new Error("Expected exactly 96 distinct held-out cases");
}
const routeMap = JSON.parse(routeText) as Record<Route, string>;
if (Object.keys(routeMap).sort().join(",") !== "answer,calculate,human,search") {
  throw new Error("Unexpected route map");
}

const decisionCapture: { value: RouteDecision<Route> | undefined } = { value: undefined };
const graph = createDemoGraph({
  routeMap,
  onDecision: (decision) => {
    decisionCapture.value = decision;
  },
});
const observations = [];
for (const row of cases) {
  decisionCapture.value = undefined;
  try {
    const result = await graph.invoke({ message: row.input });
    const decision = decisionCapture.value as RouteDecision<Route> | undefined;
    if (!decision) throw new Error("Missing routing decision");
    observations.push({
      id: row.id,
      expected: row.label,
      selectedRoute: result.selectedRoute,
      evaluatedRoute: decision.evaluatedRoute ?? decision.route,
      reason: decision.reason,
      probability: decision.probability,
      confidence: decision.confidence ?? null,
      accepted: decision.accepted,
    });
  } catch (error) {
    observations.push({
      id: row.id,
      expected: row.label,
      selectedRoute: null,
      errorName: error instanceof Error ? error.name : "UnknownError",
    });
  }
}

const human = observations.filter((row) => row.expected === "human");
const summary = {
  status: "Exploratory full-graph evaluation against AI-assisted provisional labels",
  cases: observations.length,
  successfulGraphs: observations.filter((row) => row.selectedRoute !== null).length,
  provisionalAgreement: observations.filter((row) => row.selectedRoute === row.expected).length,
  provisionalHumanCases: human.length,
  humanSelected: human.filter((row) => row.selectedRoute === "human").length,
  nonHumanSelectedForHuman: human.filter(
    (row) => row.selectedRoute !== "human" && row.selectedRoute !== null,
  ).length,
  probabilityThreshold: 0.8,
  confidenceThreshold: 0.6,
  datasetSha256: createHash("sha256").update(datasetText).digest("hex"),
  routesSha256: createHash("sha256").update(routeText).digest("hex"),
  caveat:
    "Labels are AI-assisted provisional, not human-validated. One graph call per case; SDK may retry. Do not tune thresholds on this test split.",
};
const runId = `${new Date().toISOString().replace(/[:.]/g, "-")}-fallback`;
const resultDir = resolve("benchmarks/results/runs", runId);
await mkdir(resultDir);
await writeFile(
  resolve(resultDir, "observations.jsonl"),
  `${observations.map((row) => JSON.stringify(row)).join("\n")}\n`,
  {
    flag: "wx",
  },
);
await writeFile(resolve(resultDir, "summary.json"), `${JSON.stringify(summary, null, 2)}\n`, {
  flag: "wx",
});
console.log(JSON.stringify({ resultDir, summary }));
