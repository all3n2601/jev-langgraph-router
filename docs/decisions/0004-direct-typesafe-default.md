# ADR 0004: Direct TypeSafe SDK as the default Jev transport

Status: Accepted

## Context

The AI SDK Gateway path requires a verified Gateway account and cannot use a direct TypeSafe API
key. The user has direct TypeSafe access, and the official JavaScript SDK exposes choice answers,
probabilities, confidence, cancellation, and retry settings.

## Decision

Add `jev-typesafe-router` using `@typesafe-ai/sdk`. The LangGraph adapter defaults to it and
reads `TYPESAFE_API_KEY` through the SDK. Keep `jev-ai-sdk-router` as an optional evaluator that
can be injected into the provider-neutral core or LangGraph adapter.

## Consequences

- Applications using a direct key need no Gateway account or OIDC token.
- Credentials stay in the environment; neither adapter records them in decision metadata.
- The package validates model results locally and imposes an end-to-end deadline over SDK retries.
- Two transports add maintenance cost and require separate live contract tests.
