import { Annotation, END, START, StateGraph } from "@langchain/langgraph";
import { createJevRouter } from "jev-langgraph-router";
import type { DecisionEvaluator, RouteDecision } from "jev-router-core";

export const routes = {
  answer: "Answer using stable information already available in the application.",
  search: "Use a search tool for current or external information.",
  calculate: "Use a calculator for arithmetic or deterministic numerical work.",
  human: "Request human review for approval or high-stakes judgment.",
} as const;

export type Route = keyof typeof routes;

export interface DemoState {
  readonly message: string;
  readonly privateNote?: string;
}

/** Deterministic fixture for a credential-free demo; never a production classifier. */
export const offlineEvaluator: DecisionEvaluator<string, Route> = {
  async evaluate({ state }) {
    const input = state.toLowerCase();
    const route: Route = /approve|authorize|prescri|patient|delete.*records/.test(input)
      ? "human"
      : /today|latest|current|weather|news/.test(input)
        ? "search"
        : /calculate|compute|what is \d|multiply|divided by/.test(input)
          ? "calculate"
          : "answer";
    return { route, probability: 0.99, confidence: 0.99 };
  },
};

export function createDemoGraph(
  options: {
    readonly evaluator?: DecisionEvaluator<string, Route>;
    readonly onDecision?: (decision: RouteDecision<Route>) => void;
    readonly routeMap?: Readonly<Record<Route, string>>;
  } = {},
) {
  const GraphState = Annotation.Root({
    message: Annotation<string>,
    privateNote: Annotation<string>,
    selectedRoute: Annotation<Route>,
    output: Annotation<string>,
  });
  const route = createJevRouter({
    routes: options.routeMap ?? routes,
    selectState: (state: DemoState) => state.message,
    fallback: "human",
    minimumProbability: 0.8,
    minimumConfidence: 0.6,
    ...(options.evaluator === undefined ? {} : { evaluator: options.evaluator }),
    ...(options.onDecision === undefined ? {} : { onDecision: options.onDecision }),
  });

  return new StateGraph(GraphState)
    .addNode("classify", () => ({}))
    .addNode("answer", () => ({
      selectedRoute: "answer" as const,
      output: "Answer node selected. Connect your application knowledge source here.",
    }))
    .addNode("search", () => ({
      selectedRoute: "search" as const,
      output: "Search node selected. Connect your search tool here.",
    }))
    .addNode("calculate", () => ({
      selectedRoute: "calculate" as const,
      output: "Calculator node selected. Connect your deterministic calculator here.",
    }))
    .addNode("human", () => ({
      selectedRoute: "human" as const,
      output: "Human-review node selected. No sensitive action was executed.",
    }))
    .addEdge(START, "classify")
    .addConditionalEdges("classify", route, ["answer", "search", "calculate", "human"])
    .addEdge("answer", END)
    .addEdge("search", END)
    .addEdge("calculate", END)
    .addEdge("human", END)
    .compile();
}
