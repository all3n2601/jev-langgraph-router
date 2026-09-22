import { describe, expect, it } from "vitest";
import { createTypeSafeEvaluator } from "../../src/index.js";

describe.runIf(process.env.RUN_LIVE_TYPESAFE === "1")("direct TypeSafe Jev contract", () => {
  it("returns a valid route from the real API", async () => {
    const routes = {
      answer: "The request can be answered directly.",
      search: "The request requires current external information.",
      human: "The request needs human review.",
    } as const;
    const result = await createTypeSafeEvaluator({ timeoutMs: 15_000, maxRetries: 0 }).evaluate({
      state: { message: "Find today's technology news with current sources." },
      routes,
    });
    expect(Object.hasOwn(routes, result.route)).toBe(true);
    expect(result.probability).toBeGreaterThanOrEqual(0);
    expect(result.probability).toBeLessThanOrEqual(1);
    expect(result.confidence).toBeGreaterThanOrEqual(0);
    expect(result.confidence).toBeLessThanOrEqual(1);
    expect(Object.keys(result.probabilities ?? {}).sort()).toEqual(Object.keys(routes).sort());
  }, 20_000);
});
