import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { cpus, freemem, platform, release, totalmem } from "node:os";
import { resolve } from "node:path";
import { pairedSummary, runBenchmark, summarize } from "./benchmark.js";
import { dataset, routes, type Split } from "./dataset.js";
import { createJevProvider, createOpenAIProvider, createRuleProvider } from "./providers.js";

interface CliOptions {
  providers: readonly string[];
  split: Split;
  limit: number;
  repetitions: number;
  warmups: number;
  timeoutMs: number;
  maxRequests: number;
  live: boolean;
  openaiModel?: string;
}

function parseArgs(args: readonly string[]): CliOptions {
  const values = new Map<string, string>();
  let live = false;
  for (let index = 0; index < args.length; index++) {
    const arg = args[index];
    if (arg === "--live") {
      live = true;
      continue;
    }
    if (!arg?.startsWith("--")) throw new Error(`Unexpected argument: ${arg}`);
    const value = args[++index];
    if (value === undefined || value.startsWith("--")) throw new Error(`Missing value for ${arg}`);
    values.set(arg, value);
  }
  const allowed = new Set([
    "--providers",
    "--split",
    "--limit",
    "--repetitions",
    "--warmups",
    "--timeout-ms",
    "--max-requests",
    "--openai-model",
  ]);
  for (const key of values.keys()) if (!allowed.has(key)) throw new Error(`Unknown option: ${key}`);
  const providers = (values.get("--providers") ?? "rule").split(",");
  if (
    providers.length === 0 ||
    providers.some((name) => !["rule", "jev", "openai"].includes(name))
  ) {
    throw new Error("Providers must be rule, jev, and/or openai");
  }
  if (new Set(providers).size !== providers.length) throw new Error("Duplicate providers");
  const split = values.get("--split") ?? "test";
  if (split !== "calibration" && split !== "test") throw new Error("Invalid split");
  const number = (key: string, fallback: number, minimum: number) => {
    const value = Number(values.get(key) ?? fallback);
    if (!Number.isInteger(value) || value < minimum) throw new Error(`Invalid ${key}`);
    return value;
  };
  return {
    providers,
    split,
    limit: number("--limit", 10, 1),
    repetitions: number("--repetitions", 1, 1),
    warmups: number("--warmups", 0, 0),
    timeoutMs: number("--timeout-ms", 15_000, 1),
    maxRequests: number("--max-requests", 20, 1),
    live,
    ...(values.get("--openai-model") === undefined
      ? {}
      : { openaiModel: values.get("--openai-model") as string }),
  };
}

function git(args: readonly string[]): string {
  return execFileSync("git", args, { encoding: "utf8" }).trim();
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const cases = dataset
    .filter((item) => item.split === options.split)
    .sort((a, b) => Number(a.id.slice(-2)) - Number(b.id.slice(-2)))
    .slice(0, options.limit);
  const liveProviders = options.providers.filter((name) => name !== "rule");
  const plannedRequests =
    liveProviders.length * (cases.length * options.repetitions + options.warmups);
  if (plannedRequests > options.maxRequests) {
    throw new Error(`Planned live requests (${plannedRequests}) exceed --max-requests`);
  }
  if (liveProviders.length > 0 && !options.live) throw new Error("Add --live for API providers");
  if (options.providers.includes("jev") && !process.env.TYPESAFE_API_KEY?.trim()) {
    throw new Error("TYPESAFE_API_KEY is required for Jev");
  }
  if (options.providers.includes("openai") && !process.env.OPENAI_API_KEY?.trim()) {
    throw new Error("OPENAI_API_KEY is required for the LLM baseline");
  }
  if (options.providers.includes("openai") && !options.openaiModel?.trim()) {
    throw new Error("Pass --openai-model with an available structured-output model");
  }

  const providers = options.providers.map((name) => {
    if (name === "jev") return createJevProvider(options.timeoutMs);
    if (name === "openai") {
      const model = options.openaiModel;
      if (model === undefined) throw new Error("Missing OpenAI model");
      return createOpenAIProvider(model, options.timeoutMs);
    }
    return createRuleProvider();
  });
  const startedAt = new Date().toISOString();
  const samples = await runBenchmark({
    cases,
    providers,
    repetitions: options.repetitions,
    warmups: options.warmups,
    timeoutMs: options.timeoutMs,
  });
  const finishedAt = new Date().toISOString();
  const summary = summarize(samples);
  const pair = options.providers.includes("jev")
    ? options.providers.find((name) => name !== "jev")
    : undefined;
  const comparison = pair === undefined ? null : pairedSummary(samples, "jev", pair);
  const runId = `${new Date().toISOString().replace(/[:.]/g, "-")}-${process.pid}`;
  const resultDir = resolve("benchmarks/results/runs", runId);
  await mkdir(resolve("benchmarks/results/runs"), { recursive: true });
  await mkdir(resultDir, { recursive: false });
  const datasetHash = createHash("sha256").update(JSON.stringify(dataset)).digest("hex");
  const selectedCasesHash = createHash("sha256").update(JSON.stringify(cases)).digest("hex");
  const lockHash = createHash("sha256")
    .update(await readFile("pnpm-lock.yaml"))
    .digest("hex");
  const manifest = {
    runId,
    startedAt,
    finishedAt,
    gitCommit: git(["rev-parse", "HEAD"]),
    gitDirty: git(["status", "--porcelain"]).length > 0,
    lockfileSha256: lockHash,
    dataset: {
      name: "synthetic-routing-v1",
      sha256: datasetHash,
      selectedCasesSha256: selectedCasesHash,
      license: "Apache-2.0",
      split: options.split,
      cases: cases.length,
      caseIds: cases.map((item) => item.id),
    },
    runtime: {
      node: process.version,
      platform: platform(),
      osRelease: release(),
      cpu: cpus()[0]?.model ?? "unknown",
      logicalCpus: cpus().length,
      totalMemoryBytes: totalmem(),
      freeMemoryBytesAtReport: freemem(),
      region: process.env.BENCHMARK_REGION ?? "unspecified",
    },
    configuration: {
      providers: options.providers,
      openaiModelRequested: options.openaiModel ?? null,
      routes,
      repetitions: options.repetitions,
      warmups: options.warmups,
      timeoutMs: options.timeoutMs,
      maxRequests: options.maxRequests,
      concurrency: 1,
      order: "provider order alternates by case index and repetition",
      retries: 0,
    },
    interpretation: {
      exploratory: true,
      protocolRepetitionGateMet: options.repetitions >= 30 && cases.length === 80,
      publicPerformanceClaimEligible: false,
      note: "Synthetic examples cannot establish real-world accuracy. Costs are not calculated without verified pricing.",
    },
  };
  await Promise.all([
    writeFile(resolve(resultDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`),
    writeFile(
      resolve(resultDir, "samples.jsonl"),
      `${samples.map((row) => JSON.stringify(row)).join("\n")}\n`,
    ),
    writeFile(
      resolve(resultDir, "summary.json"),
      `${JSON.stringify({ summary, comparison }, null, 2)}\n`,
    ),
  ]);
  console.log(JSON.stringify({ resultDir, summary, comparison }, null, 2));
}

main().catch((error: unknown) => {
  // Do not print provider error messages: SDK errors may contain request details.
  console.error(error instanceof Error ? error.name : "BenchmarkError");
  process.exitCode = 1;
});
