import { TypeSafeClient, choice, type EntryType, type RequestOptions } from "@typesafe-ai/sdk";
import type {
  DecisionEvaluator,
  EvaluationRequest,
  EvaluationResult,
  RouteMap,
} from "jev-router-core";

export type TypeSafeState = EntryType;

export interface TypeSafeResponse {
  readonly model: string;
  readonly answers: {
    readonly route: {
      readonly type: "choice";
      readonly choice: string;
      readonly confidence: number;
      readonly probabilities: Readonly<Record<string, number>>;
    };
  };
  readonly usage: { readonly input_tokens: number; readonly output_tokens: number };
}

export type TypeSafeSystemOne = (
  request: {
    state: TypeSafeState;
    questions: { route: ReturnType<typeof choice> };
    model?: string;
  },
  options: RequestOptions,
) => Promise<TypeSafeResponse>;

export interface TypeSafeEvaluatorOptions {
  /** SDK model override; its default is `jev-latest`. */
  readonly model?: string;
  readonly instructions?: string;
  /** End-to-end deadline, including retries. Defaults to 10 seconds. */
  readonly timeoutMs?: number;
  readonly maxRetries?: number;
  /** Pass SDK client configuration, including an API key if needed. */
  readonly client?: TypeSafeClient;
  /** Test seam or alternate transport. */
  readonly systemOne?: TypeSafeSystemOne;
}

export class TypeSafeAdapterConfigurationError extends Error {
  override readonly name = "TypeSafeAdapterConfigurationError";
}

export class TypeSafeInvalidResponseError extends Error {
  override readonly name = "TypeSafeInvalidResponseError";
}

export class TypeSafeDeadlineError extends Error {
  override readonly name = "TypeSafeDeadlineError";

  constructor(timeoutMs: number) {
    super(`TypeSafe evaluation exceeded the ${timeoutMs}ms deadline`);
  }
}

export interface TypeSafeDecisionEvaluator {
  evaluate<State extends TypeSafeState, Route extends string>(
    request: EvaluationRequest<State, Route>,
  ): Promise<EvaluationResult<Route>>;
}

const DEFAULT_INSTRUCTIONS = "Which declared route should handle this state?";
const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_MAX_RETRIES = 2;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isProbability(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1;
}

async function withDeadline<T>(
  run: (signal: AbortSignal) => Promise<T>,
  timeoutMs: number,
  parentSignal?: AbortSignal,
): Promise<T> {
  if (parentSignal?.aborted) {
    throw parentSignal.reason;
  }

  const controller = new AbortController();
  let rejectDeadline!: (reason: unknown) => void;
  const deadline = new Promise<never>((_resolve, reject) => {
    rejectDeadline = reject;
  });
  const onAbort = () => {
    controller.abort(parentSignal?.reason);
    rejectDeadline(parentSignal?.reason);
  };
  parentSignal?.addEventListener("abort", onAbort, { once: true });
  const timer = setTimeout(() => {
    const error = new TypeSafeDeadlineError(timeoutMs);
    controller.abort(error);
    rejectDeadline(error);
  }, timeoutMs);

  try {
    return await Promise.race([run(controller.signal), deadline]);
  } finally {
    clearTimeout(timer);
    parentSignal?.removeEventListener("abort", onAbort);
  }
}

function normalizeDistribution<Route extends string>(
  routes: RouteMap<Route>,
  selectedRoute: Route,
  raw: unknown,
): Readonly<Record<Route, number>> {
  if (!isRecord(raw)) {
    throw new TypeSafeInvalidResponseError("The route answer has no probability distribution");
  }
  const probabilities = {} as Record<Route, number>;
  for (const route of Object.keys(routes) as Route[]) {
    const value = raw[route];
    if (!isProbability(value)) {
      throw new TypeSafeInvalidResponseError(`Invalid probability for route "${route}"`);
    }
    probabilities[route] = value;
  }
  const selectedProbability = probabilities[selectedRoute];
  if (
    selectedProbability === undefined ||
    selectedProbability < Math.max(...(Object.values(probabilities) as number[]))
  ) {
    throw new TypeSafeInvalidResponseError("Selected route is not the most probable route");
  }
  return probabilities;
}

export function createTypeSafeEvaluator(
  options: TypeSafeEvaluatorOptions = {},
): TypeSafeDecisionEvaluator & DecisionEvaluator<TypeSafeState, string> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxRetries = options.maxRetries ?? DEFAULT_MAX_RETRIES;
  const instructions = options.instructions ?? DEFAULT_INSTRUCTIONS;

  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new TypeSafeAdapterConfigurationError("timeoutMs must be positive and finite");
  }
  if (!Number.isInteger(maxRetries) || maxRetries < 0) {
    throw new TypeSafeAdapterConfigurationError("maxRetries must be a non-negative integer");
  }
  if (instructions.trim().length === 0) {
    throw new TypeSafeAdapterConfigurationError("instructions must not be empty");
  }
  if (options.client !== undefined && options.systemOne !== undefined) {
    throw new TypeSafeAdapterConfigurationError("Provide either client or systemOne, not both");
  }

  return {
    async evaluate<State extends TypeSafeState, Route extends string>(
      request: EvaluationRequest<State, Route>,
    ): Promise<EvaluationResult<Route>> {
      const startedAt = performance.now();
      const systemOne =
        options.systemOne ??
        ((payload, callOptions) =>
          (options.client ?? new TypeSafeClient()).systemOne(payload, callOptions));
      const result: unknown = await withDeadline(
        (signal) =>
          systemOne(
            {
              state: request.state,
              questions: { route: choice(instructions, request.routes) },
              ...(options.model === undefined ? {} : { model: options.model }),
            },
            { signal, timeout: timeoutMs, retry: { maxRetries } },
          ),
        timeoutMs,
        request.signal,
      );

      if (!isRecord(result) || !isRecord(result.answers)) {
        throw new TypeSafeInvalidResponseError("The SDK returned no route answer");
      }
      const answer = result.answers.route;
      if (!isRecord(answer) || answer.type !== "choice" || typeof answer.choice !== "string") {
        throw new TypeSafeInvalidResponseError("The route answer must be a choice");
      }
      if (!Object.hasOwn(request.routes, answer.choice)) {
        throw new TypeSafeInvalidResponseError(`Undeclared route "${answer.choice}"`);
      }
      if (!isProbability(answer.confidence)) {
        throw new TypeSafeInvalidResponseError("Route confidence must be between 0 and 1");
      }
      const route = answer.choice as Route;
      const probabilities = normalizeDistribution(request.routes, route, answer.probabilities);
      const usage = isRecord(result.usage) ? result.usage : {};
      return {
        route,
        probability: probabilities[route],
        confidence: answer.confidence,
        probabilities,
        durationMs: performance.now() - startedAt,
        metadata: {
          modelId: result.model,
          inputTokens: usage.input_tokens,
          outputTokens: usage.output_tokens,
        },
      };
    },
  };
}
