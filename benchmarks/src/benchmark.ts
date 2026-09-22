import type { BenchmarkCase, Route } from "./dataset.js";
import { routes } from "./dataset.js";

export interface ProviderResult {
  readonly route: Route;
  readonly modelId?: string;
  readonly confidence?: number;
  readonly inputTokens?: number;
  readonly outputTokens?: number;
}

export interface Provider {
  readonly name: string;
  evaluate(input: string, signal: AbortSignal): Promise<ProviderResult>;
}

export interface Sample {
  readonly provider: string;
  readonly caseId: string;
  readonly split: BenchmarkCase["split"];
  readonly repetition: number;
  readonly expected: Route;
  readonly predicted?: Route;
  readonly durationMs: number;
  readonly correct: boolean;
  readonly modelId?: string;
  readonly confidence?: number;
  readonly inputTokens?: number;
  readonly outputTokens?: number;
  readonly errorName?: string;
}

export interface ProviderSummary {
  readonly samples: number;
  readonly successes: number;
  readonly accuracy: number;
  readonly macroF1: number;
  readonly p50Ms: number;
  readonly p95Ms: number;
  readonly p99Ms: number;
  readonly meanInputTokens: number | null;
  readonly meanOutputTokens: number | null;
  readonly modelIds: readonly string[];
}

export interface PairedSummary {
  readonly compared: readonly [string, string];
  /** Positive means the first provider is slower. */
  readonly meanLatencyDifferenceMs: number;
  readonly latencyDifference95CiMs: readonly [number, number];
  /** Positive means the first provider is more accurate. */
  readonly accuracyDifference: number;
  readonly accuracyDifference95Ci: readonly [number, number];
}

function mean(values: readonly number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function percentile(values: readonly number[], quantile: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.max(0, Math.ceil(quantile * sorted.length) - 1)] ?? 0;
}

function macroF1(samples: readonly Sample[]): number {
  const labels = Object.keys(routes) as Route[];
  return mean(
    labels.map((label) => {
      const tp = samples.filter(
        (sample) => sample.expected === label && sample.predicted === label,
      ).length;
      const fp = samples.filter(
        (sample) => sample.expected !== label && sample.predicted === label,
      ).length;
      const fn = samples.filter(
        (sample) => sample.expected === label && sample.predicted !== label,
      ).length;
      const denominator = 2 * tp + fp + fn;
      return denominator === 0 ? 0 : (2 * tp) / denominator;
    }),
  );
}

function meanOrNull(values: readonly (number | undefined)[]): number | null {
  const known = values.filter((value): value is number => value !== undefined);
  return known.length === 0 ? null : mean(known);
}

export function summarize(samples: readonly Sample[]): Readonly<Record<string, ProviderSummary>> {
  const names = [...new Set(samples.map((sample) => sample.provider))];
  return Object.fromEntries(
    names.map((name) => {
      const rows = samples.filter((sample) => sample.provider === name);
      return [
        name,
        {
          samples: rows.length,
          successes: rows.filter((sample) => sample.predicted !== undefined).length,
          accuracy: rows.filter((sample) => sample.correct).length / rows.length,
          macroF1: macroF1(rows),
          p50Ms: percentile(
            rows.map((sample) => sample.durationMs),
            0.5,
          ),
          p95Ms: percentile(
            rows.map((sample) => sample.durationMs),
            0.95,
          ),
          p99Ms: percentile(
            rows.map((sample) => sample.durationMs),
            0.99,
          ),
          meanInputTokens: meanOrNull(rows.map((sample) => sample.inputTokens)),
          meanOutputTokens: meanOrNull(rows.map((sample) => sample.outputTokens)),
          modelIds: [...new Set(rows.flatMap((sample) => sample.modelId ?? []))],
        } satisfies ProviderSummary,
      ];
    }),
  );
}

/** Seeded resampling makes committed confidence intervals reproducible. */
function bootstrap95(values: readonly number[], iterations = 2_000): readonly [number, number] {
  let seed = 0x5eed1234;
  const random = () => {
    seed = (Math.imul(1664525, seed) + 1013904223) >>> 0;
    return seed / 2 ** 32;
  };
  const means = Array.from({ length: iterations }, () =>
    mean(
      Array.from(
        { length: values.length },
        () => values[Math.floor(random() * values.length)] ?? 0,
      ),
    ),
  );
  return [percentile(means, 0.025), percentile(means, 0.975)];
}

export function pairedSummary(
  samples: readonly Sample[],
  first: string,
  second: string,
): PairedSummary {
  const secondByKey = new Map(
    samples
      .filter((sample) => sample.provider === second)
      .map((sample) => [`${sample.caseId}:${sample.repetition}`, sample]),
  );
  const pairs = samples
    .filter((sample) => sample.provider === first)
    .flatMap((sample) => {
      const other = secondByKey.get(`${sample.caseId}:${sample.repetition}`);
      return other === undefined ? [] : [{ sample, other }];
    });
  if (pairs.length === 0) throw new Error("No paired samples to compare");
  const byCase = new Map<string, { latency: number[]; accuracy: number[] }>();
  for (const { sample, other } of pairs) {
    const group = byCase.get(sample.caseId) ?? { latency: [], accuracy: [] };
    group.latency.push(sample.durationMs - other.durationMs);
    group.accuracy.push(Number(sample.correct) - Number(other.correct));
    byCase.set(sample.caseId, group);
  }
  // Repeated calls on one case are correlated; bootstrap case-level means, not calls.
  const latency = [...byCase.values()].map((group) => mean(group.latency));
  const accuracy = [...byCase.values()].map((group) => mean(group.accuracy));
  return {
    compared: [first, second],
    meanLatencyDifferenceMs: mean(latency),
    latencyDifference95CiMs: bootstrap95(latency),
    accuracyDifference: mean(accuracy),
    accuracyDifference95Ci: bootstrap95(accuracy),
  };
}

export async function runBenchmark(options: {
  readonly cases: readonly BenchmarkCase[];
  readonly providers: readonly Provider[];
  readonly repetitions: number;
  readonly warmups: number;
  readonly timeoutMs: number;
}): Promise<readonly Sample[]> {
  const { cases, providers, repetitions, warmups, timeoutMs } = options;
  const firstCase = cases[0];
  if (firstCase === undefined || providers.length === 0)
    throw new Error("Cases and providers are required");
  if (!Number.isInteger(repetitions) || repetitions < 1) throw new Error("Invalid repetitions");
  if (!Number.isInteger(warmups) || warmups < 0) throw new Error("Invalid warmups");
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) throw new Error("Invalid timeout");
  if (new Set(providers.map((provider) => provider.name)).size !== providers.length) {
    throw new Error("Provider names must be unique");
  }

  // Warmups are deliberately omitted from reported samples.
  for (const provider of providers) {
    for (let i = 0; i < warmups; i++) {
      try {
        await provider.evaluate(firstCase.input, AbortSignal.timeout(timeoutMs));
      } catch {
        // Failure remains visible through measured samples, not fabricated warmup results.
      }
    }
  }

  const samples: Sample[] = [];
  for (let repetition = 0; repetition < repetitions; repetition++) {
    for (const [caseIndex, benchmarkCase] of cases.entries()) {
      const orderedProviders =
        (caseIndex + repetition) % 2 === 0 ? providers : [...providers].reverse();
      for (const provider of orderedProviders) {
        const startedAt = performance.now();
        try {
          const result = await provider.evaluate(
            benchmarkCase.input,
            AbortSignal.timeout(timeoutMs),
          );
          if (!Object.hasOwn(routes, result.route)) throw new Error("UndeclaredRoute");
          samples.push({
            provider: provider.name,
            caseId: benchmarkCase.id,
            split: benchmarkCase.split,
            repetition,
            expected: benchmarkCase.label,
            predicted: result.route,
            durationMs: performance.now() - startedAt,
            correct: result.route === benchmarkCase.label,
            ...(result.modelId === undefined ? {} : { modelId: result.modelId }),
            ...(result.confidence === undefined ? {} : { confidence: result.confidence }),
            ...(result.inputTokens === undefined ? {} : { inputTokens: result.inputTokens }),
            ...(result.outputTokens === undefined ? {} : { outputTokens: result.outputTokens }),
          });
        } catch (error) {
          samples.push({
            provider: provider.name,
            caseId: benchmarkCase.id,
            split: benchmarkCase.split,
            repetition,
            expected: benchmarkCase.label,
            durationMs: performance.now() - startedAt,
            correct: false,
            errorName: error instanceof Error ? error.name : "UnknownError",
          });
        }
      }
    }
  }
  return samples;
}
