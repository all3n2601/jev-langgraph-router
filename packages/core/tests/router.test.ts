import { describe, expect, it, vi } from "vitest";
import { createRouter, InvalidRouterConfigurationError } from "../src/index.js";

const routes = {
  answer: "Answer directly",
  search: "Search external sources",
  human: "Request human review",
} as const;

describe("createRouter", () => {
  it("returns an accepted declared route above the threshold", async () => {
    const evaluate = vi.fn().mockResolvedValue({ route: "search", probability: 0.95 });
    const route = createRouter({ routes, evaluator: { evaluate }, fallback: "human" });

    await expect(route({ query: "latest news" })).resolves.toEqual({
      route: "search",
      probability: 0.95,
      accepted: true,
      reason: "accepted",
    });
  });

  it("uses the fallback below the probability threshold and preserves the route", async () => {
    const evaluate = vi.fn().mockResolvedValue({ route: "answer", probability: 0.6 });
    const route = createRouter({
      routes,
      evaluator: { evaluate },
      minimumProbability: 0.8,
      fallback: "human",
    });

    await expect(route({ query: "ambiguous" })).resolves.toMatchObject({
      route: "human",
      evaluatedRoute: "answer",
      accepted: false,
      reason: "low-probability",
    });
  });

  it("rejects provider routes outside the declaration", async () => {
    const evaluate = vi.fn().mockResolvedValue({ route: "delete", probability: 1 });
    const route = createRouter({ routes, evaluator: { evaluate }, fallback: "human" });

    await expect(route({})).resolves.toMatchObject({
      route: "human",
      accepted: false,
      reason: "invalid-result",
    });
  });

  it.each([Number.NaN, -0.1, 1.1])(
    "rejects the invalid provider probability %s",
    async (probability) => {
      const evaluate = vi.fn().mockResolvedValue({ route: "answer", probability });
      const route = createRouter({ routes, evaluator: { evaluate }, fallback: "human" });

      await expect(route({})).resolves.toMatchObject({
        route: "human",
        probability: 0,
        accepted: false,
        reason: "invalid-result",
      });
    },
  );

  it.each([Number.NaN, -0.1, 1.1])(
    "rejects the invalid provider confidence %s",
    async (confidence) => {
      const evaluate = vi.fn().mockResolvedValue({ route: "answer", probability: 1, confidence });
      const route = createRouter({ routes, evaluator: { evaluate }, fallback: "human" });

      await expect(route({})).resolves.toMatchObject({
        route: "human",
        probability: 0,
        accepted: false,
        reason: "invalid-result",
      });
    },
  );

  it("applies a provider-confidence threshold independently", async () => {
    const evaluate = vi
      .fn()
      .mockResolvedValue({ route: "answer", probability: 0.99, confidence: 0.4 });
    const route = createRouter({
      routes,
      evaluator: { evaluate },
      minimumProbability: 0.9,
      minimumConfidence: 0.6,
      fallback: "human",
    });

    await expect(route({})).resolves.toMatchObject({
      route: "human",
      evaluatedRoute: "answer",
      reason: "low-confidence",
    });
  });

  it("falls back when required provider confidence is absent", async () => {
    const evaluate = vi.fn().mockResolvedValue({ route: "answer", probability: 0.99 });
    const route = createRouter({
      routes,
      evaluator: { evaluate },
      minimumConfidence: 0.6,
      fallback: "human",
    });

    await expect(route({})).resolves.toMatchObject({ reason: "low-confidence" });
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

  it("labels a non-Error evaluator rejection", async () => {
    const evaluate = vi.fn().mockRejectedValue("provider unavailable");
    const route = createRouter({ routes, evaluator: { evaluate }, fallback: "human" });

    await expect(route({}, new AbortController().signal)).resolves.toMatchObject({
      reason: "evaluator-failed",
      metadata: { errorName: "UnknownError" },
    });
  });

  it("forwards an abort signal and rethrows an aborted evaluation", async () => {
    const controller = new AbortController();
    controller.abort(new Error("cancelled"));
    const evaluate = vi.fn().mockRejectedValue(controller.signal.reason);
    const route = createRouter({ routes, evaluator: { evaluate }, fallback: "human" });

    await expect(route({}, controller.signal)).rejects.toThrow("cancelled");
    expect(evaluate).toHaveBeenCalledWith(expect.objectContaining({ signal: controller.signal }));
  });

  it.each([Number.NaN, -0.1, 1.1])(
    "rejects the invalid probability threshold %s",
    (minimumProbability) => {
      expect(() =>
        createRouter({
          routes,
          evaluator: { evaluate: vi.fn() },
          minimumProbability,
          fallback: "human",
        }),
      ).toThrow(InvalidRouterConfigurationError);
    },
  );

  it.each([Number.NaN, -0.1, 1.1])(
    "rejects the invalid confidence threshold %s",
    (minimumConfidence) => {
      expect(() =>
        createRouter({
          routes,
          evaluator: { evaluate: vi.fn() },
          minimumConfidence,
          fallback: "human",
        }),
      ).toThrow(InvalidRouterConfigurationError);
    },
  );

  it("rejects an undeclared fallback at runtime", () => {
    expect(() =>
      createRouter({
        routes,
        evaluator: { evaluate: vi.fn() },
        fallback: "delete" as never,
      }),
    ).toThrow("fallback must be a declared route");
  });
});
