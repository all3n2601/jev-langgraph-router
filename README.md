# jev-langgraph-router

Typed, confidence-aware routing for LangGraph.js applications using Jev.

> **Project status: pre-alpha.** The architecture and core routing contract are in place. The
> live Jev adapter, LangGraph adapter, examples, and reproducible benchmarks are planned and must
> meet the acceptance gates in [`IMPLEMENTATION_PLAN.md`](./IMPLEMENTATION_PLAN.md) before the
> first release.

## Why this exists

Agent graphs often spend a general-purpose language-model call on a small decision: which node
should execute next? This project aims to replace that decision with Jev, preserve type safety,
fall back safely when confidence is low, and measure whether the change actually improves
latency and cost without unacceptable loss of routing accuracy.

The claim is deliberately narrow: this package does not make LangGraph internals faster. It aims
to make applications built with LangGraph execute fewer or cheaper model operations.

## Intended packages

| Package | Responsibility | Status |
| --- | --- | --- |
| `jev-router-core` | Framework-independent policies, types, thresholds, fallbacks | Foundation |
| `jev-ai-sdk-router` | Jev evaluator built on AI SDK's evaluation API | Planned |
| `jev-langgraph-router` | LangGraph conditional-edge adapter | Planned |

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
  confidenceThreshold: 0.92,
  fallback: "human",
});

graph.addConditionalEdges("classify", route);
```

This API is a design target, not yet a published or stable interface.

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
