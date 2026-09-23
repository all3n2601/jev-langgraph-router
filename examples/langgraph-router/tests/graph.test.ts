import { describe, expect, it, vi } from "vitest";
import { createDemoGraph, offlineEvaluator, type Route } from "../src/graph.js";

describe("runnable LangGraph example", () => {
  it.each([
    ["Explain a stack", "answer"],
    ["Find today's weather", "search"],
    ["Calculate 17 multiplied by 23", "calculate"],
    ["Approve this transfer", "human"],
  ] as const)("routes %s to %s offline", async (message, expected) => {
    const result = await createDemoGraph({ evaluator: offlineEvaluator }).invoke({ message });
    expect(result.selectedRoute).toBe(expected);
    expect(result.output).toContain("node selected");
  });

  it("projects only the message and falls back on low confidence", async () => {
    const evaluate = vi.fn(async () => ({
      route: "answer" as Route,
      probability: 0.9,
      confidence: 0.1,
    }));
    const graph = createDemoGraph({ evaluator: { evaluate } });
    const result = await graph.invoke({ message: "Hello", privateNote: "do not send" });
    expect(evaluate).toHaveBeenCalledWith({
      state: "Hello",
      routes: expect.any(Object),
      signal: expect.any(AbortSignal),
    });
    expect(result.selectedRoute).toBe("human");
  });

  it("uses the supplied workflow route descriptions and records the fallback decision", async () => {
    const routeMap = {
      answer: "Explain a local FAQ",
      search: "Retrieve account records",
      calculate: "Perform arithmetic",
      human: "Request approval before a cancellation",
    };
    const evaluate = vi.fn(async () => ({
      route: "search" as Route,
      probability: 0.7,
      confidence: 0.9,
    }));
    const onDecision = vi.fn();
    const result = await createDemoGraph({
      evaluator: { evaluate },
      routeMap,
      onDecision,
    }).invoke({ message: "Cancel my order" });
    expect(evaluate).toHaveBeenCalledWith({
      state: "Cancel my order",
      routes: routeMap,
      signal: expect.any(AbortSignal),
    });
    expect(onDecision).toHaveBeenCalledWith(
      expect.objectContaining({
        route: "human",
        evaluatedRoute: "search",
        reason: "low-probability",
      }),
    );
    expect(result.selectedRoute).toBe("human");
  });
});
