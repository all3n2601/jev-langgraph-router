# ADR-0003: AI SDK evaluation boundary

- Status: Accepted
- Date: 2026-09-22

## Context

AI SDK 7.0.105 introduced the experimental evaluation API used to call Jev. Choice answers expose
an optional probability distribution. TypeSafe provider metadata separately exposes a confidence
statistic that describes distribution concentration. The two values are not interchangeable. The
API also owns transient retry behavior through `maxRetries` and accepts an abort signal.

## Decision

`jev-ai-sdk-router` supports AI SDK `>=7.0.105 <8` and isolates every experimental type and call in
the adapter package. It requires a complete choice distribution for Jev routes, returns the
selected route's probability separately from optional TypeSafe confidence, and rejects malformed
or undeclared outputs locally.

AI SDK owns individual retry attempts. The adapter forwards `maxRetries` and owns one end-to-end
deadline around all attempts, propagating the same abort signal to AI SDK. Evaluation is injectable
for offline contract tests. The default remains AI SDK's `experimental_evaluate` function.

## Consequences

The core package remains independent of AI SDK churn, and applications can choose independent
probability and confidence thresholds. A patch release of AI SDK could still change the
experimental contract, so the adapter is tested against both recorded shapes and AI SDK's official
mock evaluation model. The adapter remains private until a bounded live smoke test is completed.

## Alternatives

Implementing a second retry loop was rejected because nested retries make cost and deadlines
unpredictable. Treating TypeSafe confidence as the selected option's probability was rejected
because it would misrepresent the model output. Calling the Gateway HTTP endpoint directly was
deferred because AI SDK already provides typed questions, answer validation, retry behavior, and
provider portability.
