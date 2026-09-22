import OpenAI from "openai";
import { createTypeSafeEvaluator } from "jev-typesafe-router";
import type { Provider } from "./benchmark.js";
import { routes, type Route } from "./dataset.js";

export function createJevProvider(timeoutMs: number): Provider {
  const evaluator = createTypeSafeEvaluator({ timeoutMs, maxRetries: 0 });
  return {
    name: "jev",
    async evaluate(input, signal) {
      const result = await evaluator.evaluate({ state: input, routes, signal });
      return {
        route: result.route,
        ...(result.confidence === undefined ? {} : { confidence: result.confidence }),
        modelId: String(result.metadata?.modelId ?? "unknown"),
        ...(typeof result.metadata?.inputTokens === "number"
          ? { inputTokens: result.metadata.inputTokens }
          : {}),
        ...(typeof result.metadata?.outputTokens === "number"
          ? { outputTokens: result.metadata.outputTokens }
          : {}),
      };
    },
  };
}

export function createOpenAIProvider(
  model: string,
  timeoutMs: number,
  client: OpenAI = new OpenAI({ maxRetries: 0 }),
): Provider {
  if (model.trim().length === 0) throw new Error("An explicit OpenAI model ID is required");
  const routeNames = Object.keys(routes) as Route[];
  const instructions = [
    "Select exactly one next step for this request. Return only the route field.",
    ...routeNames.map((route) => `${route}: ${routes[route]}`),
  ].join("\n");

  return {
    name: "openai",
    async evaluate(input, signal) {
      const response = await client.responses.create(
        {
          model,
          instructions,
          input,
          store: false,
          max_output_tokens: 128,
          text: {
            format: {
              type: "json_schema",
              name: "routing_decision",
              strict: true,
              schema: {
                type: "object",
                properties: { route: { type: "string", enum: routeNames } },
                required: ["route"],
                additionalProperties: false,
              },
            },
          },
        },
        { signal, timeout: timeoutMs, maxRetries: 0 },
      );
      const parsed: unknown = JSON.parse(response.output_text);
      if (
        typeof parsed !== "object" ||
        parsed === null ||
        !("route" in parsed) ||
        typeof parsed.route !== "string" ||
        !Object.hasOwn(routes, parsed.route)
      ) {
        throw new Error("InvalidStructuredRoute");
      }
      return {
        route: parsed.route as Route,
        modelId: response.model,
        ...(response.usage == null
          ? {}
          : {
              inputTokens: response.usage.input_tokens,
              outputTokens: response.usage.output_tokens,
            }),
      };
    },
  };
}

/** A cheap sanity baseline, deliberately fixed before observing held-out results. */
export function createRuleProvider(): Provider {
  return {
    name: "rule",
    async evaluate(input) {
      const text = input.toLowerCase();
      let route: Route = "answer";
      if (
        /approve|authorize|prescri|patient|legal|lawsuit|security breach|fire this employee|fraud checks|evacuat|audit log|protected characteristic|confidential|administrator rights|incident evidence|binding tax|safety lock|transfer ownership|sign this/.test(
          text,
        )
      ) {
        route = "human";
      } else if (
        /today|current|latest|newest|next train|last night|this week|tonight|this weekend|tomorrow|most recent|now|status|balance|shipping|quarterly earnings|restaurant.*menu|open on/.test(
          text,
        )
      ) {
        route = "search";
      } else if (
        /calculate|compute|how many|what is \d|what percentage|area of|perimeter|volume of|ratio of|average of|median of|square root|sum of|difference between|divided by|multiplied by|split equally|discounted|power of/.test(
          text,
        )
      ) {
        route = "calculate";
      }
      return { route, modelId: "fixed-rules-v1" };
    },
  };
}
