# jev-ai-sdk-router

AI SDK adapter that converts a Jev choice evaluation into the provider-neutral routing contract.
The package is pre-alpha and remains private while its contract tests and live smoke test are
completed.

```ts
import { createJevEvaluator } from "jev-ai-sdk-router";
import { createRouter } from "jev-router-core";

const routes = {
  answer: "Can be answered directly",
  search: "Requires current or external information",
  human: "Requires review",
} as const;

const route = createRouter({
  routes,
  evaluator: createJevEvaluator({ timeoutMs: 5_000, maxRetries: 2 }),
  minimumProbability: 0.9,
  minimumConfidence: 0.6,
  fallback: "human",
});
```

The adapter keeps the selected route's probability separate from TypeSafe's optional confidence
statistic. Missing distributions and malformed or undeclared routes are rejected locally. AI SDK
owns transient retry behavior; `maxRetries` is passed through unchanged, while this adapter owns
the end-to-end timeout surrounding all attempts.
