import { Annotation, END, START, StateGraph } from "@langchain/langgraph";
import { describe, expect, it, vi } from "vitest";
import { createJevRouter } from "../src/index.js";

const routes = {
  answer: "Answer without external information",
  search: "Search external information",
  human: "Request human review",
} as const;

type State = { message: string; secret: string };

describe("createJevRouter", () => {
  it("routes a compiled LangGraph and sends only projected state", async () => {
    const evaluate = vi.fn().mockResolvedValue({ route: "search", probability: 0.95 });
    const onDecision = vi.fn();
    const router = createJevRouter({
      routes,
      selectState: (state: State) => ({ message: state.message }),
      evaluator: { evaluate },
      fallback: "human",
      minimumProbability: 0.8,
      onDecision,
    });

    const GraphState = Annotation.Root({
      message: Annotation<string>,
      secret: Annotation<string>,
      result: Annotation<string>,
    });
    const graph = new StateGraph(GraphState)
      .addNode("classify", () => ({}))
      .addNode("answer", () => ({ result: "answered" }))
      .addNode("search", () => ({ result: "searched" }))
      .addNode("human", () => ({ result: "review" }))
      .addEdge(START, "classify")
      .addConditionalEdges("classify", router, ["answer", "search", "human"])
      .addEdge("answer", END)
      .addEdge("search", END)
      .addEdge("human", END)
      .compile();

    const result = await graph.invoke({ message: "What happened today?", secret: "private" });

    expect(result.result).toBe("searched");
    expect(evaluate).toHaveBeenCalledWith({
      state: { message: "What happened today?" },
      routes,
      signal: expect.any(AbortSignal),
    });
    expect(onDecision).toHaveBeenCalledWith(
      expect.objectContaining({ route: "search", accepted: true }),
    );
  });

  it("sends uncertain decisions to the declared fallback node", async () => {
    const router = createJevRouter({
      routes,
      selectState: (state: State) => state.message,
      evaluator: {
        evaluate: async () => ({ route: "answer", probability: 0.94, confidence: 0.2 }),
      },
      minimumConfidence: 0.6,
      fallback: "human",
    });

    await expect(router({ message: "Maybe", secret: "private" }, {})).resolves.toBe("human");
  });

  it("ignores a decision observer failure", async () => {
    const router = createJevRouter({
      routes,
      selectState: (state: State) => state.message,
      evaluator: { evaluate: async () => ({ route: "answer", probability: 1 }) },
      fallback: "human",
      onDecision: () => {
        throw new Error("telemetry failed");
      },
    });

    await expect(router({ message: "Hello", secret: "private" }, {})).resolves.toBe("answer");
  });

  it("passes options to the default direct TypeSafe evaluator", async () => {
    const systemOne = vi.fn().mockResolvedValue({
      answers: {
        route: {
          type: "choice",
          choice: "answer",
          confidence: 0.9,
          probabilities: { answer: 0.98, search: 0.01, human: 0.01 },
        },
      },
      usage: { input_tokens: 10, output_tokens: 0 },
      model: "jev-mock",
    });
    const router = createJevRouter({
      routes,
      selectState: (state: State) => state.message,
      typesafe: { systemOne },
      fallback: "human",
    });

    await expect(router({ message: "Hello", secret: "private" }, {})).resolves.toBe("answer");
    expect(systemOne).toHaveBeenCalledOnce();
  });
});
