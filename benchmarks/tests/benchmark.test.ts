import { describe, expect, it, vi } from "vitest";
import {
  pairedSummary,
  runBenchmark,
  summarize,
  type Provider,
  type Sample,
} from "../src/benchmark.js";
import { dataset, routes } from "../src/dataset.js";
import { createRuleProvider } from "../src/providers.js";

describe("synthetic routing dataset", () => {
  it("has 100 unique, balanced, nonempty labeled cases with a fixed split", () => {
    expect(dataset).toHaveLength(100);
    expect(new Set(dataset.map((item) => item.id)).size).toBe(100);
    for (const route of Object.keys(routes)) {
      const group = dataset.filter((item) => item.label === route);
      expect(group).toHaveLength(25);
      expect(group.filter((item) => item.split === "calibration")).toHaveLength(5);
      expect(group.filter((item) => item.split === "test")).toHaveLength(20);
      expect(group.every((item) => item.input.trim().length > 0)).toBe(true);
    }
  });
});

describe("benchmark harness", () => {
  const cases = dataset.filter((item) => item.split === "test").slice(0, 2);

  it("records paired predictions, failures, order rotation, and excludes warmups", async () => {
    const order: string[] = [];
    const first: Provider = {
      name: "first",
      evaluate: vi.fn(async () => {
        order.push("first");
        return { route: "answer" as const };
      }),
    };
    const second: Provider = {
      name: "second",
      evaluate: vi.fn(async () => {
        order.push("second");
        throw new Error("fixture failure");
      }),
    };
    const samples = await runBenchmark({
      cases,
      providers: [first, second],
      repetitions: 2,
      warmups: 1,
      timeoutMs: 100,
    });
    expect(samples).toHaveLength(8);
    expect(order.slice(2)).toEqual([
      "first",
      "second",
      "second",
      "first",
      "second",
      "first",
      "first",
      "second",
    ]);
    expect(samples.filter((sample) => sample.provider === "second")).toEqual(
      expect.arrayContaining([expect.objectContaining({ errorName: "Error", correct: false })]),
    );
    expect(summarize(samples).second?.successes).toBe(0);
  });

  it("computes deterministic paired confidence intervals", () => {
    const samples: Sample[] = [
      {
        provider: "jev",
        caseId: "a",
        split: "test",
        repetition: 0,
        expected: "answer",
        predicted: "answer",
        correct: true,
        durationMs: 10,
      },
      {
        provider: "llm",
        caseId: "a",
        split: "test",
        repetition: 0,
        expected: "answer",
        predicted: "search",
        correct: false,
        durationMs: 30,
      },
      {
        provider: "jev",
        caseId: "b",
        split: "test",
        repetition: 0,
        expected: "search",
        predicted: "answer",
        correct: false,
        durationMs: 20,
      },
      {
        provider: "llm",
        caseId: "b",
        split: "test",
        repetition: 0,
        expected: "search",
        predicted: "search",
        correct: true,
        durationMs: 40,
      },
    ];
    const pair = pairedSummary(samples, "jev", "llm");
    expect(pair.meanLatencyDifferenceMs).toBe(-20);
    expect(pair.latencyDifference95CiMs).toEqual([-20, -20]);
    expect(pair.accuracyDifference).toBe(0);
    expect(pair.accuracyDifference95Ci).toEqual([-1, 1]);
    expect(pairedSummary(samples, "jev", "llm")).toEqual(pair);
    const summary = summarize(samples);
    expect(summary.jev).toMatchObject({ samples: 2, successes: 2, accuracy: 0.5 });
    expect(summary.llm).toMatchObject({ samples: 2, successes: 2, accuracy: 0.5 });
  });

  it("rejects invalid run configuration", async () => {
    const provider = createRuleProvider();
    const base = { cases, providers: [provider], repetitions: 1, warmups: 0, timeoutMs: 100 };
    await expect(runBenchmark({ ...base, cases: [] })).rejects.toThrow("Cases");
    await expect(runBenchmark({ ...base, providers: [] })).rejects.toThrow("Cases");
    await expect(runBenchmark({ ...base, repetitions: 0 })).rejects.toThrow("repetitions");
    await expect(runBenchmark({ ...base, warmups: -1 })).rejects.toThrow("warmups");
    await expect(runBenchmark({ ...base, timeoutMs: 0 })).rejects.toThrow("timeout");
    await expect(runBenchmark({ ...base, providers: [provider, provider] })).rejects.toThrow(
      "unique",
    );
    expect(() => pairedSummary([], "jev", "llm")).toThrow("No paired");
  });

  it("runs the fixed rule baseline without any API key", async () => {
    const samples = await runBenchmark({
      cases: dataset.filter((item) =>
        ["answer-06", "search-06", "calculate-06", "human-06"].includes(item.id),
      ),
      providers: [createRuleProvider()],
      repetitions: 1,
      warmups: 0,
      timeoutMs: 100,
    });
    expect(samples).toHaveLength(4);
    expect(samples.every((sample) => sample.predicted !== undefined)).toBe(true);
  });
});
