import { describe, expect, it, vi } from "vitest";
import { createRouter, InvalidRouterConfigurationError } from "../src/index.js";

const routes = {
  answer: "Answer directly",
  search: "Search external sources",
  human: "Request human review",
} as const;

describe("createRouter", () => {
  it("returns an accepted declared route above the threshold", async () => {
    const evaluate = vi.fn().mockResolvedValue({ route: "search", confidence: 0.95 });
    const route = createRouter({ routes, evaluator: { evaluate }, fallback: "human" });

    await expect(route({ query: "latest news" })).resolves.toEqual({
      route: "search",
      confidence: 0.95,
      accepted: true,
      reason: "accepted",
    });
  });

  it("uses the fallback below the threshold and preserves the evaluated route", async () => {
    const evaluate = vi.fn().mockResolvedValue({ route: "answer", confidence: 0.6 });
    const route = createRouter({
      routes,
      evaluator: { evaluate },
      confidenceThreshold: 0.8,
      fallback: "human",
    });

    await expect(route({ query: "ambiguous" })).resolves.toMatchObject({
      route: "human",
      evaluatedRoute: "answer",
      accepted: false,
      reason: "low-confidence",
    });
  });

  it("rejects provider routes outside the declaration", async () => {
    const evaluate = vi.fn().mockResolvedValue({ route: "delete", confidence: 1 });
    const route = createRouter({ routes, evaluator: { evaluate }, fallback: "human" });

    await expect(route({})).resolves.toMatchObject({
      route: "human",
      accepted: false,
      reason: "invalid-result",
    });
  });

  it("uses the fallback when the evaluator fails", async () => {
    const evaluate = vi.fn().mockRejectedValue(new TypeError("network failure"));
    const route = createRouter({ routes, evaluator: { evaluate }, fallback: "human" });

    await expect(route({})).resolves.toMatchObject({
      route: "human",
      accepted: false,
      reason: "evaluator-failed",
      metadata: { errorName: "TypeError" },
    });
  });

  it("rejects invalid thresholds at construction", () => {
    expect(() =>
      createRouter({
        routes,
        evaluator: { evaluate: vi.fn() },
        confidenceThreshold: 1.1,
        fallback: "human",
      }),
    ).toThrow(InvalidRouterConfigurationError);
  });
});
