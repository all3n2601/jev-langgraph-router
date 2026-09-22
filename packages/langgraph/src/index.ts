import type { LangGraphRunnableConfig } from "@langchain/langgraph";
import { createJevEvaluator, type JevEvaluatorOptions, type JevState } from "jev-ai-sdk-router";
import {
  createRouter,
  type DecisionEvaluator,
  type RouteDecision,
  type RouterOptions,
} from "jev-router-core";

export interface JevRouterOptions<State, Projected extends JevState, Route extends string>
  extends Omit<RouterOptions<Projected, Route>, "evaluator"> {
  /** Select only the state Jev needs to make the routing decision. */
  readonly selectState: (state: State) => Projected;
  /** Supply a fake or alternate evaluator; defaults to Jev through AI SDK. */
  readonly evaluator?: DecisionEvaluator<Projected, Route>;
  /** Options used only when the default Jev evaluator is created. */
  readonly jev?: JevEvaluatorOptions;
  /** Observe the final decision without exposing the projected state. */
  readonly onDecision?: (decision: RouteDecision<Route>) => void;
}

/**
 * Create a LangGraph conditional-edge function with a closed set of route names.
 * Route names must match graph node names unless a path map is supplied to LangGraph.
 */
export function createJevRouter<State, Projected extends JevState, const Route extends string>(
  options: JevRouterOptions<State, Projected, Route>,
): (state: State, config: LangGraphRunnableConfig) => Promise<Route> {
  const evaluator = options.evaluator ?? createJevEvaluator(options.jev);
  const route = createRouter<Projected, Route>({
    routes: options.routes,
    evaluator,
    fallback: options.fallback,
    ...(options.minimumProbability === undefined
      ? {}
      : { minimumProbability: options.minimumProbability }),
    ...(options.minimumConfidence === undefined
      ? {}
      : { minimumConfidence: options.minimumConfidence }),
  });

  return async (state, config) => {
    const decision = await route(options.selectState(state), config.signal);
    try {
      options.onDecision?.(decision);
    } catch {
      // Observability must not redirect or fail an already completed decision.
    }
    return decision.route;
  };
}
