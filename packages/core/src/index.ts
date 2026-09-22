export type RouteMap<Route extends string> = Readonly<Record<Route, string>>;

export interface EvaluationRequest<State, Route extends string> {
  readonly state: State;
  readonly routes: RouteMap<Route>;
  readonly signal?: AbortSignal;
}

export interface EvaluationResult<Route extends string> {
  readonly route: Route;
  /** Probability assigned to the selected route. */
  readonly probability: number;
  /** Optional provider-specific concentration/confidence statistic. */
  readonly confidence?: number;
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
  readonly reason:
    | "accepted"
    | "low-probability"
    | "low-confidence"
    | "invalid-result"
    | "evaluator-failed";
}

export interface RouterOptions<State, Route extends string> {
  readonly routes: RouteMap<Route>;
  readonly evaluator: DecisionEvaluator<State, Route>;
  readonly minimumProbability?: number;
  readonly minimumConfidence?: number;
  readonly fallback: Route;
}

export class InvalidRouterConfigurationError extends Error {
  override readonly name = "InvalidRouterConfigurationError";
}

export function createRouter<State, const Route extends string>(
  options: RouterOptions<State, Route>,
): (state: State, signal?: AbortSignal) => Promise<RouteDecision<Route>> {
  const minimumProbability = options.minimumProbability ?? 0.9;
  const minimumConfidence = options.minimumConfidence;
  const routeNames = new Set(Object.keys(options.routes));

  if (!Number.isFinite(minimumProbability) || minimumProbability < 0 || minimumProbability > 1) {
    throw new InvalidRouterConfigurationError("minimumProbability must be between 0 and 1");
  }

  if (
    minimumConfidence !== undefined &&
    (!Number.isFinite(minimumConfidence) || minimumConfidence < 0 || minimumConfidence > 1)
  ) {
    throw new InvalidRouterConfigurationError("minimumConfidence must be between 0 and 1");
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
      const validProbability =
        Number.isFinite(result.probability) && result.probability >= 0 && result.probability <= 1;
      const validConfidence =
        result.confidence === undefined ||
        (Number.isFinite(result.confidence) && result.confidence >= 0 && result.confidence <= 1);

      if (!validRoute || !validProbability || !validConfidence) {
        return {
          route: options.fallback,
          probability: 0,
          accepted: false,
          reason: "invalid-result",
        };
      }

      if (result.probability < minimumProbability) {
        return {
          ...result,
          route: options.fallback,
          evaluatedRoute: result.route,
          accepted: false,
          reason: "low-probability",
        };
      }

      if (
        minimumConfidence !== undefined &&
        (result.confidence === undefined || result.confidence < minimumConfidence)
      ) {
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
        probability: 0,
        accepted: false,
        reason: "evaluator-failed",
        metadata: { errorName: error instanceof Error ? error.name : "UnknownError" },
      };
    }
  };
}
