import { describe, expect, it, vi } from "vitest";
import { TypeSafeClient } from "@typesafe-ai/sdk";
import {
  createTypeSafeEvaluator,
  TypeSafeAdapterConfigurationError,
  TypeSafeDeadlineError,
  TypeSafeInvalidResponseError,
} from "../src/index.js";

const routes = { answer: "Answer directly", search: "Search the web" } as const;
const response = {
  model: "jev-test",
  answers: {
    route: {
      type: "choice" as const,
      choice: "search",
      confidence: 0.93,
      probabilities: { answer: 0.04, search: 0.96 },
    },
  },
  usage: { input_tokens: 12, output_tokens: 0 },
};

describe("direct TypeSafe evaluator", () => {
  it("calls the SDK choice API and normalizes probabilities and confidence", async () => {
    const systemOne = vi.fn().mockResolvedValue(response);
    const evaluator = createTypeSafeEvaluator({
      systemOne,
      model: "jev-test",
      instructions: "Pick a route",
      maxRetries: 0,
    });
    const result = await evaluator.evaluate({ state: { message: "Latest news?" }, routes });

    expect(systemOne).toHaveBeenCalledWith(
      {
        state: { message: "Latest news?" },
        questions: { route: { type: "choice", instructions: "Pick a route", criteria: routes } },
        model: "jev-test",
      },
      { signal: expect.any(AbortSignal), timeout: 10_000, retry: { maxRetries: 0 } },
    );
    expect(result).toMatchObject({
      route: "search",
      probability: 0.96,
      confidence: 0.93,
      probabilities: response.answers.route.probabilities,
      metadata: { modelId: "jev-test", inputTokens: 12, outputTokens: 0 },
    });
  });

  it.each([
    ["missing response", null],
    ["missing answer", { ...response, answers: {} }],
    ["wrong answer type", { ...response, answers: { route: { type: "noul" } } }],
    [
      "undeclared route",
      { ...response, answers: { route: { ...response.answers.route, choice: "other" } } },
    ],
    [
      "invalid confidence",
      { ...response, answers: { route: { ...response.answers.route, confidence: 2 } } },
    ],
    [
      "missing distribution",
      { ...response, answers: { route: { ...response.answers.route, probabilities: null } } },
    ],
    [
      "invalid probability",
      {
        ...response,
        answers: {
          route: { ...response.answers.route, probabilities: { answer: -1, search: 0.96 } },
        },
      },
    ],
    [
      "inconsistent selection",
      {
        ...response,
        answers: {
          route: { ...response.answers.route, probabilities: { answer: 0.99, search: 0.01 } },
        },
      },
    ],
  ])("rejects %s", async (_name, malformed) => {
    const evaluator = createTypeSafeEvaluator({ systemOne: vi.fn().mockResolvedValue(malformed) });
    await expect(evaluator.evaluate({ state: "Hi", routes })).rejects.toBeInstanceOf(
      TypeSafeInvalidResponseError,
    );
  });

  it.each([
    [{ timeoutMs: 0 }, "timeoutMs"],
    [{ maxRetries: -1 }, "maxRetries"],
    [{ instructions: " " }, "instructions"],
    [{ client: {} as never, systemOne: vi.fn() }, "either"],
  ])("validates options", (options, message) => {
    expect(() => createTypeSafeEvaluator(options)).toThrow(TypeSafeAdapterConfigurationError);
    expect(() => createTypeSafeEvaluator(options)).toThrow(message);
  });

  it("enforces a total deadline", async () => {
    const evaluator = createTypeSafeEvaluator({
      timeoutMs: 5,
      systemOne: () => new Promise(() => {}),
    });
    await expect(evaluator.evaluate({ state: "Hi", routes })).rejects.toBeInstanceOf(
      TypeSafeDeadlineError,
    );
  });

  it("honors caller cancellation", async () => {
    const controller = new AbortController();
    const evaluator = createTypeSafeEvaluator({ systemOne: () => new Promise(() => {}) });
    const pending = evaluator.evaluate({ state: "Hi", routes, signal: controller.signal });
    controller.abort(new Error("stopped"));
    await expect(pending).rejects.toThrow("stopped");
  });

  it("rejects a caller signal already aborted before transport", async () => {
    const controller = new AbortController();
    controller.abort(new Error("already stopped"));
    const systemOne = vi.fn();
    const evaluator = createTypeSafeEvaluator({ systemOne });
    await expect(
      evaluator.evaluate({ state: "Hi", routes, signal: controller.signal }),
    ).rejects.toThrow("already stopped");
    expect(systemOne).not.toHaveBeenCalled();
  });

  it("uses the official SDK client when supplied", async () => {
    const fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(response), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    const client = new TypeSafeClient({ apiKey: "test-only", fetch });
    const evaluator = createTypeSafeEvaluator({ client });
    const result = await evaluator.evaluate({ state: "Hi", routes });
    expect(result.route).toBe("search");
    expect(fetch).toHaveBeenCalledOnce();
  });

  it("tolerates missing usage metadata", async () => {
    const evaluator = createTypeSafeEvaluator({
      systemOne: vi.fn().mockResolvedValue({ ...response, usage: null }),
    });
    const result = await evaluator.evaluate({ state: "Hi", routes });
    expect(result.route).toBe("search");
    expect(result.metadata?.inputTokens).toBeUndefined();
  });

  it("constructs the default SDK client lazily", async () => {
    const evaluator = createTypeSafeEvaluator();
    const original = process.env.TYPESAFE_API_KEY;
    delete process.env.TYPESAFE_API_KEY;
    try {
      await expect(evaluator.evaluate({ state: "Hi", routes })).rejects.toThrow();
    } finally {
      if (original !== undefined) process.env.TYPESAFE_API_KEY = original;
    }
  });
});
