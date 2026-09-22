export type RouteMap<Route extends string> = Readonly<Record<Route, string>>;

export interface EvaluationRequest<State, Route extends string> {
  readonly state: State;
  readonly routes: RouteMap<Route>;
  readonly signal?: AbortSignal;
}

export interface EvaluationResult<Route extends string> {
  readonly route: Route;
  readonly confidence: number;
  readonly probabilities?: Readonly<Partial<Record<Route, number>>>;
  readonly durationMs?: number;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

export interface DecisionEvaluator<State, Route extends string> {
  evaluate(request: EvaluationRequest<State, Route>): Promise<EvaluationResult<Route>>;
}

export interface RouteDecision<Route extends string> extends EvaluationResult<Route> {
  readonly accepted: boolean;
  readonly evaluatedRoute?: Route;
  readonly reason: "accepted" | "low-confidence" | "invalid-result" | "evaluator-failed";
}

export interface RouterOptions<State, Route extends string> {
  readonly routes: RouteMap<Route>;
  readonly evaluator: DecisionEvaluator<State, Route>;
  readonly confidenceThreshold?: number;
  readonly fallback: Route;
}

export class InvalidRouterConfigurationError extends Error {
  override readonly name = "InvalidRouterConfigurationError";
}

export function createRouter<State, const Route extends string>(
  options: RouterOptions<State, Route>,
): (state: State, signal?: AbortSignal) => Promise<RouteDecision<Route>> {
  const threshold = options.confidenceThreshold ?? 0.9;
  const routeNames = new Set(Object.keys(options.routes));

  if (!Number.isFinite(threshold) || threshold < 0 || threshold > 1) {
    throw new InvalidRouterConfigurationError("confidenceThreshold must be between 0 and 1");
  }

  if (!routeNames.has(options.fallback)) {
    throw new InvalidRouterConfigurationError("fallback must be a declared route");
  }

  return async (state, signal) => {
    try {
      const result = await options.evaluator.evaluate({
        state,
        routes: options.routes,
        ...(signal === undefined ? {} : { signal }),
      });

      const validRoute = routeNames.has(result.route);
      const validConfidence =
        Number.isFinite(result.confidence) && result.confidence >= 0 && result.confidence <= 1;

      if (!validRoute || !validConfidence) {
        return {
          route: options.fallback,
          confidence: 0,
          accepted: false,
          reason: "invalid-result",
        };
      }

      if (result.confidence < threshold) {
        return {
          ...result,
          route: options.fallback,
          evaluatedRoute: result.route,
          accepted: false,
          reason: "low-confidence",
        };
      }

      return { ...result, accepted: true, reason: "accepted" };
    } catch (error) {
      if (signal?.aborted) {
        throw error;
      }

      return {
        route: options.fallback,
        confidence: 0,
        accepted: false,
        reason: "evaluator-failed",
        metadata: { errorName: error instanceof Error ? error.name : "UnknownError" },
      };
    }
  };
}
