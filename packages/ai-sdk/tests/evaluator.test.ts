import { describe, expect, it, vi } from "vitest";
import { Experimental_EvaluationMockModelV4 as MockEvaluationModel } from "ai/test";
import {
  createJevEvaluator,
  type AiSdkEvaluate,
  JevAdapterConfigurationError,
  JevInvalidResponseError,
  JevTimeoutError,
} from "../src/index.js";

const routes = {
  answer: "Can be answered directly",
  search: "Requires external information",
  human: "Requires human review",
} as const;

const request = {
  state: { message: "What happened today?" },
  routes,
} as const;

function resultFixture(overrides: Record<string, unknown> = {}) {
  return {
    answers: {
      route: {
        type: "choice",
        choice: "search",
        probabilities: { answer: 0.05, search: 0.9, human: 0.05 },
      },
    },
    usage: { inputTokens: 12, outputTokens: 0, totalTokens: 12 },
    warnings: [],
    rounding: undefined,
    providerMetadata: { typesafe: { confidence: { route: 0.8 } } },
    response: {
      id: "eval-1",
      timestamp: new Date("2026-09-22T12:00:00Z"),
      modelId: "typesafe-ai/jev",
    },
    ...overrides,
  };
}

function injectedEvaluate(implementation: (...args: never[]) => unknown) {
  const mock = vi.fn(implementation);
  return { mock, evaluate: mock as unknown as AiSdkEvaluate };
}

describe("createJevEvaluator", () => {
  it("works through AI SDK's evaluation contract without an injected function", async () => {
    const model = new MockEvaluationModel({
      doEvaluate: async () => ({
        answers: {
          route: {
            type: "choice" as const,
            choice: "search",
            probabilities: { answer: 0.05, search: 0.9, human: 0.05 },
          },
        },
        warnings: [],
        usage: { inputTokens: 12, outputTokens: 0 },
        providerMetadata: { typesafe: { confidence: { route: 0.8 } } },
        response: { modelId: "jev-mock" },
      }),
    });
    const evaluator = createJevEvaluator({ model });

    await expect(evaluator.evaluate(request)).resolves.toMatchObject({
      route: "search",
      probability: 0.9,
      confidence: 0.8,
      metadata: { modelId: "jev-mock" },
    });
  });

  it("maps a typed Jev choice to the core routing result", async () => {
    const { mock, evaluate } = injectedEvaluate(async () => resultFixture());
    const evaluator = createJevEvaluator({ evaluate });

    const result = await evaluator.evaluate(request);

    expect(result).toMatchObject({
      route: "search",
      probability: 0.9,
      confidence: 0.8,
      probabilities: { answer: 0.05, search: 0.9, human: 0.05 },
      metadata: {
        modelId: "typesafe-ai/jev",
        responseId: "eval-1",
        inputTokens: 12,
        outputTokens: 0,
        totalTokens: 12,
        warningCount: 0,
      },
    });
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
    expect(mock).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "typesafe-ai/jev",
        state: request.state,
        maxRetries: 2,
        questions: {
          route: {
            type: "choice",
            instructions: "Which declared route should handle this state?",
            criteria: routes,
          },
        },
        abortSignal: expect.any(AbortSignal),
      }),
    );
  });

  it("passes explicit model, question, headers, provider options, and retry count", async () => {
    const { mock, evaluate } = injectedEvaluate(async () =>
      resultFixture({ providerMetadata: undefined }),
    );
    const evaluator = createJevEvaluator({
      evaluate,
      model: "typesafe-ai/jev",
      instructions: "Select the safest route.",
      maxRetries: 4,
      headers: { "x-correlation-id": "test-1" },
      providerOptions: { gateway: { zeroDataRetention: true } },
    });

    const result = await evaluator.evaluate(request);

    expect(result.confidence).toBeUndefined();
    expect(mock).toHaveBeenCalledWith(
      expect.objectContaining({
        maxRetries: 4,
        headers: { "x-correlation-id": "test-1" },
        providerOptions: { gateway: { zeroDataRetention: true } },
        questions: {
          route: expect.objectContaining({ instructions: "Select the safest route." }),
        },
      }),
    );
  });

  it.each([
    ["non-choice answer", { type: "boolean", probability: 0.9 }],
    ["missing answer", undefined],
    ["undeclared route", { type: "choice", choice: "delete", probabilities: {} }],
    ["missing distribution", { type: "choice", choice: "search" }],
    [
      "invalid distribution value",
      {
        type: "choice",
        choice: "search",
        probabilities: { answer: 0.05, search: Number.NaN, human: 0.05 },
      },
    ],
    [
      "selected route is not maximal",
      {
        type: "choice",
        choice: "search",
        probabilities: { answer: 0.8, search: 0.1, human: 0.1 },
      },
    ],
  ])("rejects a malformed result: %s", async (_label, answer) => {
    const { evaluate } = injectedEvaluate(async () =>
      resultFixture({ answers: { route: answer } }),
    );
    const evaluator = createJevEvaluator({ evaluate });

    await expect(evaluator.evaluate(request)).rejects.toBeInstanceOf(JevInvalidResponseError);
  });

  it("rejects malformed provider confidence", async () => {
    const { evaluate } = injectedEvaluate(async () =>
      resultFixture({ providerMetadata: { typesafe: { confidence: { route: 2 } } } }),
    );
    const evaluator = createJevEvaluator({ evaluate });

    await expect(evaluator.evaluate(request)).rejects.toThrow(
      "TypeSafe route confidence must be between 0 and 1",
    );
  });

  it.each([
    undefined,
    {},
    { typesafe: null },
    { typesafe: { confidence: null } },
    { typesafe: { confidence: { otherQuestion: 0.8 } } },
  ])("treats absent route confidence as unavailable", async (providerMetadata) => {
    const { evaluate } = injectedEvaluate(async () => resultFixture({ providerMetadata }));
    const evaluator = createJevEvaluator({ evaluate });

    await expect(evaluator.evaluate(request)).resolves.not.toHaveProperty("confidence");
  });

  it("enforces an end-to-end timeout and aborts the SDK call", async () => {
    let receivedSignal: AbortSignal | undefined;
    const { evaluate } = injectedEvaluate(
      ({ abortSignal }: { abortSignal: AbortSignal }) =>
        new Promise((_resolve, reject) => {
          receivedSignal = abortSignal;
          abortSignal.addEventListener("abort", () => reject(abortSignal.reason), { once: true });
        }),
    );
    const evaluator = createJevEvaluator({ evaluate, timeoutMs: 5 });

    await expect(evaluator.evaluate(request)).rejects.toBeInstanceOf(JevTimeoutError);
    expect(receivedSignal?.aborted).toBe(true);
  });

  it("does not invoke AI SDK when the caller signal is already aborted", async () => {
    const controller = new AbortController();
    controller.abort(new Error("cancelled"));
    const { mock, evaluate } = injectedEvaluate(async () => resultFixture());
    const evaluator = createJevEvaluator({ evaluate });

    await expect(evaluator.evaluate({ ...request, signal: controller.signal })).rejects.toThrow(
      "cancelled",
    );
    expect(mock).not.toHaveBeenCalled();
  });

  it("propagates caller cancellation during a request", async () => {
    const controller = new AbortController();
    const { evaluate } = injectedEvaluate(
      ({ abortSignal }: { abortSignal: AbortSignal }) =>
        new Promise((_resolve, reject) => {
          abortSignal.addEventListener("abort", () => reject(abortSignal.reason), { once: true });
        }),
    );
    const evaluator = createJevEvaluator({ evaluate });
    const pending = evaluator.evaluate({ ...request, signal: controller.signal });

    controller.abort(new Error("caller cancelled"));

    await expect(pending).rejects.toThrow("caller cancelled");
  });

  it("preserves upstream rate-limit errors for the core fallback policy", async () => {
    class RateLimitError extends Error {
      override readonly name = "RateLimitError";
    }
    const { evaluate } = injectedEvaluate(async () => {
      throw new RateLimitError("429 Too Many Requests");
    });
    const evaluator = createJevEvaluator({ evaluate });

    await expect(evaluator.evaluate(request)).rejects.toMatchObject({
      name: "RateLimitError",
      message: "429 Too Many Requests",
    });
  });

  it.each([
    [{ timeoutMs: 0 }, "timeoutMs"],
    [{ timeoutMs: Number.NaN }, "timeoutMs"],
    [{ maxRetries: -1 }, "maxRetries"],
    [{ maxRetries: 1.5 }, "maxRetries"],
    [{ instructions: "  " }, "instructions"],
  ] as const)("rejects invalid configuration %j", (options, message) => {
    expect(() => createJevEvaluator(options)).toThrow(JevAdapterConfigurationError);
    expect(() => createJevEvaluator(options)).toThrow(message);
  });
});
