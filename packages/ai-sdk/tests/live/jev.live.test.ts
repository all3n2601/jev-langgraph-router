import { describe, expect, it } from "vitest";
import { createJevEvaluator } from "../../src/index.js";

const live = process.env.RUN_LIVE_JEV === "1";

describe.runIf(live)("Jev live contract", () => {
  it("returns a valid closed-set routing decision through AI Gateway", async () => {
    const routes = {
      answer: "The request can be answered without current or external information.",
      search: "The request requires current or external information.",
      human: "The request is ambiguous or requires human review.",
    } as const;

    const evaluator = createJevEvaluator({
      timeoutMs: 15_000,
      maxRetries: 1,
      providerOptions: { gateway: { zeroDataRetention: true } },
    });

    const result = await evaluator.evaluate({
      state: {
        message: "Find today's most important technology news and include current sources.",
      },
      routes,
    });

    expect(Object.hasOwn(routes, result.route)).toBe(true);
    expect(result.probability).toBeGreaterThanOrEqual(0);
    expect(result.probability).toBeLessThanOrEqual(1);
    expect(Object.keys(result.probabilities ?? {}).sort()).toEqual(Object.keys(routes).sort());
    expect(result.metadata?.modelId).toBeTruthy();
  }, 20_000);
});
