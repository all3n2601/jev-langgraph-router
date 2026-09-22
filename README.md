# jev-langgraph-router

Typed, confidence-aware routing for LangGraph.js applications using Jev.

> **Project status: pre-alpha.** Core, direct Jev and Gateway adapters, and a LangGraph adapter
> pass offline tests. Live direct verification, examples, and reproducible benchmarks remain
> before the first release; see [`IMPLEMENTATION_PLAN.md`](./IMPLEMENTATION_PLAN.md).

## Why this exists

Agent graphs often spend a general-purpose language-model call on a small decision: which node
should execute next? This project aims to replace that decision with Jev, preserve type safety,
fall back safely when confidence is low, and measure whether the change actually improves
latency and cost without unacceptable loss of routing accuracy.

The claim is deliberately narrow: this package does not make LangGraph internals faster. It aims
to make applications built with LangGraph execute fewer or cheaper model operations.

## Packages

| Package | Responsibility | Status |
| --- | --- | --- |
| `jev-router-core` | Framework-independent policies, types, thresholds, fallbacks | Foundation |
| `jev-typesafe-router` | Direct Jev evaluator using the official TypeSafe SDK | Offline tested |
| `jev-ai-sdk-router` | Jev evaluator built on AI SDK's evaluation API | Offline tested |
| `jev-langgraph-router` | LangGraph conditional-edge adapter | Offline tested |

## Planned API

```ts
import { createJevRouter } from "jev-langgraph-router";

const route = createJevRouter({
  routes: {
    search: "Requires current or external information",
    calculate: "Requires mathematical computation",
    answer: "Can be answered directly",
    human: "Requires approval or presents material risk",
  },
  selectState: (state: { message: string; customerId: string }) => ({ message: state.message }),
  minimumProbability: 0.92,
  minimumConfidence: 0.6,
  fallback: "human",
});

graph.addConditionalEdges("classify", route);
```

This API defaults to the direct TypeSafe SDK but is not yet published or stable. A compiled
LangGraph integration test runs offline. To use AI Gateway instead, inject
`evaluator: createJevEvaluator()` from `jev-ai-sdk-router`.

For one direct live smoke test, save a fresh `TYPESAFE_API_KEY` in the ignored root `.env` file,
then run `RUN_LIVE_TYPESAFE=1 pnpm test:live`. Never commit or paste a key into chat.

## Performance standard

Every performance statement must publish the dataset, exact dependency versions, runtime and
hardware, raw samples, warm-up policy, number of repetitions, accuracy definition, confidence
intervals, and commands needed to reproduce it. See [`docs/BENCHMARKING.md`](./docs/BENCHMARKING.md).

## Development

Requirements: Node.js 22+ and pnpm 10.

```sh
pnpm install
pnpm check
```

See [`CONTRIBUTING.md`](./CONTRIBUTING.md) before opening a change.

## Documentation

- [Complete implementation plan](./IMPLEMENTATION_PLAN.md)
- [Architecture](./docs/architecture/OVERVIEW.md)
- [Benchmark methodology](./docs/BENCHMARKING.md)
- [Threat model](./docs/THREAT_MODEL.md)
- [Release process](./docs/RELEASING.md)
- [Decision records](./docs/decisions/README.md)

## License

Apache License 2.0. See [`LICENSE`](./LICENSE).
