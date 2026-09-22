# jev-typesafe-router

Direct Jev adapter using the official `@typesafe-ai/sdk`. It is pre-alpha and unpublished.

Put a new direct TypeSafe key in the root `.env` file as `TYPESAFE_API_KEY=...`. Keep it out of
source control and chat. The SDK reads this variable automatically.

```ts
import { createTypeSafeEvaluator } from "jev-typesafe-router";
import { createRouter } from "jev-router-core";

const route = createRouter({
  routes: { answer: "Answer directly", search: "Needs current information", human: "Review" },
  evaluator: createTypeSafeEvaluator({ timeoutMs: 5_000, maxRetries: 0 }),
  minimumProbability: 0.9,
  fallback: "human",
});
```

The SDK's selected-route probability and confidence are kept separate. An undeclared route,
malformed distribution, or invalid confidence fails closed through the core router. The whole
call, including retries, has an end-to-end deadline.

Normal tests are offline. To run one real, bounded request after setting a valid key:

```sh
RUN_LIVE_TYPESAFE=1 pnpm test:live
```
