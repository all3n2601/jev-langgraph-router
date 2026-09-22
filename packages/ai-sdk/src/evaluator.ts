import {
  experimental_evaluate as aiSdkEvaluate,
  type Experimental_EvaluationModel,
  type JSONValue,
} from "ai";
import type {
  DecisionEvaluator,
  EvaluationRequest,
  EvaluationResult,
  RouteMap,
} from "jev-router-core";
import { withDeadline } from "./deadline.js";
import { JevAdapterConfigurationError, JevInvalidResponseError } from "./errors.js";

export type AiSdkEvaluate = typeof aiSdkEvaluate;
export type JevState = string | Readonly<Record<string, JSONValue>> | readonly JSONValue[];
type AiSdkProviderOptions = Parameters<AiSdkEvaluate>[0]["providerOptions"];

export interface JevEvaluatorOptions {
  /** Evaluation model or Gateway model ID. Defaults to `typesafe-ai/jev`. */
  readonly model?: Experimental_EvaluationModel;
  /** Fixed question sent with the route criteria. */
  readonly instructions?: string;
  /** Entire-call deadline, including AI SDK retries. Defaults to 10 seconds. */
  readonly timeoutMs?: number;
  /** Retry count delegated to AI SDK. Defaults to 2. */
  readonly maxRetries?: number;
  readonly providerOptions?: AiSdkProviderOptions;
  readonly headers?: Readonly<Record<string, string>>;
  /** Test and advanced integration seam. */
  readonly evaluate?: AiSdkEvaluate;
}

export interface JevDecisionEvaluator {
  evaluate<State extends JevState, Route extends string>(
    request: EvaluationRequest<State, Route>,
  ): Promise<EvaluationResult<Route>>;
}

const DEFAULT_MODEL = "typesafe-ai/jev";
const DEFAULT_INSTRUCTIONS = "Which declared route should handle this state?";
const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_MAX_RETRIES = 2;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isProbability(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1;
}

function readProviderConfidence(metadata: unknown): number | undefined {
  if (!isRecord(metadata) || !isRecord(metadata.typesafe)) {
    return undefined;
  }

  const confidence = metadata.typesafe.confidence;
  if (!isRecord(confidence) || confidence.route === undefined) {
    return undefined;
  }

  if (!isProbability(confidence.route)) {
    throw new JevInvalidResponseError("TypeSafe route confidence must be between 0 and 1");
  }

  return confidence.route;
}

function normalizeDistribution<Route extends string>(
  routes: RouteMap<Route>,
  selectedRoute: Route,
  probabilities: unknown,
): Readonly<Record<Route, number>> {
  if (!isRecord(probabilities)) {
    throw new JevInvalidResponseError(
      "The route answer did not include a probability distribution",
    );
  }

  const normalized = {} as Record<Route, number>;
  for (const route of Object.keys(routes) as Route[]) {
    const probability = probabilities[route];
    if (!isProbability(probability)) {
      throw new JevInvalidResponseError(`Route probability for "${route}" must be between 0 and 1`);
    }
    normalized[route] = probability;
  }

  const selectedProbability = normalized[selectedRoute];
  const highestProbability = Math.max(...(Object.values(normalized) as number[]));
  if (selectedProbability < highestProbability) {
    throw new JevInvalidResponseError("The selected route does not have the highest probability");
  }

  return normalized;
}

function assertOptions(options: JevEvaluatorOptions): void {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxRetries = options.maxRetries ?? DEFAULT_MAX_RETRIES;
  const instructions = options.instructions ?? DEFAULT_INSTRUCTIONS;

  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new JevAdapterConfigurationError("timeoutMs must be a positive finite number");
  }

  if (!Number.isInteger(maxRetries) || maxRetries < 0) {
    throw new JevAdapterConfigurationError("maxRetries must be a non-negative integer");
  }

  if (instructions.trim().length === 0) {
    throw new JevAdapterConfigurationError("instructions must not be empty");
  }
}

export function createJevEvaluator(
  options: JevEvaluatorOptions = {},
): JevDecisionEvaluator & DecisionEvaluator<JevState, string> {
  assertOptions(options);

  const evaluate = options.evaluate ?? aiSdkEvaluate;
  const model = options.model ?? DEFAULT_MODEL;
  const instructions = options.instructions ?? DEFAULT_INSTRUCTIONS;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxRetries = options.maxRetries ?? DEFAULT_MAX_RETRIES;

  return {
    async evaluate<State extends JevState, Route extends string>(
      request: EvaluationRequest<State, Route>,
    ): Promise<EvaluationResult<Route>> {
      const startedAt = performance.now();
      const criteria = request.routes;

      const result = await withDeadline(
        (abortSignal) =>
          evaluate({
            model,
            state: request.state,
            questions: {
              route: {
                type: "choice",
                instructions,
                criteria,
              },
            },
            maxRetries,
            abortSignal,
            ...(options.headers === undefined ? {} : { headers: { ...options.headers } }),
            ...(options.providerOptions === undefined
              ? {}
              : { providerOptions: options.providerOptions }),
          }),
        timeoutMs,
        request.signal,
      );

      const answer: unknown = result.answers.route;
      if (!isRecord(answer) || answer.type !== "choice" || typeof answer.choice !== "string") {
        throw new JevInvalidResponseError("The route answer must be a choice answer");
      }

      if (!Object.hasOwn(request.routes, answer.choice)) {
        throw new JevInvalidResponseError(`Jev returned undeclared route "${answer.choice}"`);
      }

      const route = answer.choice as Route;
      const probabilities = normalizeDistribution(request.routes, route, answer.probabilities);
      const confidence = readProviderConfidence(result.providerMetadata);

      return {
        route,
        probability: probabilities[route],
        ...(confidence === undefined ? {} : { confidence }),
        probabilities,
        durationMs: performance.now() - startedAt,
        metadata: {
          modelId: result.response.modelId,
          responseId: result.response.id,
          inputTokens: result.usage.inputTokens,
          outputTokens: result.usage.outputTokens,
          totalTokens: result.usage.totalTokens,
          warningCount: result.warnings.length,
        },
      };
    },
  };
}
