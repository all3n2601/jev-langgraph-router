# Complete implementation plan

## 1. Product definition

`jev-langgraph-router` is a TypeScript companion library for LangGraph.js. It converts application
state into a typed route decision using Jev, applies a local confidence and validity policy, and
returns a LangGraph-compatible conditional-edge value. The repository also contains a reusable
core and an AI SDK adapter so routing policy is not coupled to LangGraph.

### Primary user

A TypeScript developer whose agent graph uses a general-purpose language model to choose among a
small, closed set of next nodes and who needs lower latency or cost without silently sacrificing
routing quality.

### Success criteria

The first stable release must:

1. Provide compile-time inference for route names and fallback values.
2. Never return a route outside the caller's declared set.
3. Support confidence thresholds, timeouts, retries, and deterministic fallback behavior.
4. Expose enough telemetry to attribute every decision without logging private state by default.
5. Demonstrate a statistically defensible improvement against at least one LLM-router baseline.
6. Publish all benchmark inputs allowed by their license and all benchmark code and raw results.
7. Work on maintained Node.js versions supported by the current AI SDK and LangGraph.js releases.

### Non-goals for 1.0

- General text generation, RAG, or agent hosting.
- Modifying LangGraph internals.
- Claiming that every workflow becomes faster.
- Automatic prompt optimization.
- Browser support until credential-safe usage can be defined.
- A proxy service or hosted control plane.

## 2. Repository architecture

```text
.
├── packages/
│   ├── core/       # Pure routing policy; no provider or framework dependency
│   ├── ai-sdk/     # Jev evaluation and response normalization
│   └── langgraph/  # Conditional-edge adapter and LangGraph types
├── benchmarks/     # Datasets, runners, baselines, statistics, result manifests
├── examples/       # Minimal runnable integrations
├── docs/
│   ├── architecture/
│   └── decisions/  # Architecture Decision Records (ADRs)
└── .github/        # CI, security, contribution and issue workflows
```

Dependency direction is one-way:

```text
jev-router-core <- jev-ai-sdk-router <- jev-langgraph-router
```

`core` must remain usable with a fake evaluator, direct TypeSafe client, or another future
evaluation provider. `langgraph` may depend on public APIs from the other packages; the reverse is
forbidden. Examples and benchmarks are consumers and may not be imported by packages.

## 3. Runtime design

### 3.1 Request lifecycle

1. The LangGraph adapter receives graph state.
2. A caller-supplied projector produces the smallest evaluation state necessary for routing.
3. The AI SDK adapter converts declared routes into one Jev choice question.
4. The adapter sends a bounded request with timeout and retry settings.
5. The response normalizer extracts the selected route, confidence, probabilities, request data,
   model identifier, and warnings when available.
6. Core validates that the route is declared and the confidence is finite and in `[0, 1]`.
7. Core applies the configured acceptance policy.
8. The accepted route or deterministic fallback is returned to LangGraph.
9. An optional telemetry callback receives redacted decision metadata.

### 3.2 Core contracts

Implement these stable concepts before provider-specific code:

- `RouteMap<Route>`: descriptions for a closed union of route names.
- `EvaluationRequest<State, Route>`: projected state, route map, and optional signal.
- `EvaluationResult<Route>`: selection, confidence, probabilities, timing, and metadata.
- `DecisionEvaluator`: provider-neutral asynchronous evaluation interface.
- `AcceptancePolicy`: validates and accepts or rejects an evaluation.
- `FallbackPolicy`: static route, callback, or explicit error.
- `DecisionTrace`: privacy-conscious metadata emitted after a decision.
- Typed errors: timeout, provider failure, invalid result, low confidence, and abort.

Policies must be pure functions and unit-testable. Provider adapters own network behavior. Framework
adapters own only state projection and return-shape translation.

### 3.3 Failure policy

Fail closed by default. A request must not proceed down an unrecognized route. Callers choose one
of three explicit behaviors:

- return a declared fallback route;
- execute a fallback evaluator such as a general-purpose LLM;
- throw a typed routing error for the graph to handle.

Timeouts and abort signals apply to the entire decision. Retries are limited to transient failures,
use exponential backoff with jitter, and honor `Retry-After`. Invalid or low-confidence answers are
not retried unless the caller opts in.

### 3.4 Observability

Emit opt-in structured events for `decision.started`, `decision.accepted`, `decision.fallback`, and
`decision.failed`. Events include duration, attempt count, route, threshold, confidence, package
versions, and available provider/model identifiers. State and route descriptions are excluded by
default. Support OpenTelemetry later through an adapter rather than a hard dependency.

## 4. Package plan

### Phase 0 — foundation

Deliverables:

- repository policies, Apache-2.0 license, security policy, and release documentation;
- pnpm workspace with strict shared TypeScript configuration;
- CI for formatting, linting, type checking, tests, build, and package validation;
- Changesets configuration and npm provenance settings;
- architecture and benchmark decision records.

Exit gate: a clean checkout installs and `pnpm check` passes on the minimum supported Node version.

### Phase 1 — `jev-router-core`

Tasks:

1. Implement generic route types with literal-name inference.
2. Implement result validation without a runtime-schema dependency.
3. Add threshold, minimum-margin, and custom acceptance policies.
4. Add static, callback, chained-evaluator, and throwing fallback policies.
5. Preserve `AbortSignal` and distinguish abort from timeout.
6. Add telemetry hooks that cannot change the routing result.
7. Add deterministic fake and scripted evaluators for consumer tests.
8. Document every exported symbol with examples.

Tests:

- table-driven unit tests for thresholds and probability margins;
- property-based tests for invalid numeric values and undeclared routes;
- type tests proving invalid fallback routes do not compile;
- concurrency and abort tests;
- telemetry failure-isolation tests.

Exit gate: 100% branch coverage for policy code and zero production dependencies unless justified
in an ADR.

### Phase 2 — `jev-ai-sdk-router`

Status: in progress. The offline adapter, AI SDK mock integration, response validation, timeout,
cancellation, retry pass-through, and opt-in bounded live smoke-test entry point are implemented.
Executing and recording the live contract fixture remains. The initial call reached AI Gateway but
received `403 customer_verification_required` until the Gateway account has a valid card on file.

Tasks:

1. Pin the minimum compatible AI SDK major version as a peer dependency.
2. Translate a `RouteMap` to an `experimental_evaluate` choice question.
3. Normalize Jev response fields behind a single internal module.
4. Record response and gateway metadata without assuming a resolved model version exists.
5. Implement timeout, transient retry, backoff, and abort handling.
6. Expose dependency injection for the evaluate function so tests never require live credentials.
7. Provide contract fixtures for success, low confidence, missing metadata, malformed responses,
   rate limiting, server failure, and cancellation.
8. Put live tests behind an explicit environment flag and budget ceiling.

Exit gate: all contract tests pass offline; one opt-in live smoke test is documented and redacts
credentials and application state.

### Phase 3 — `jev-langgraph-router`

Status: in progress. The conditional-edge adapter, state projection, decision observer, and real
compiled-graph test are implemented. Compatibility testing across the supported LangGraph range
and consumer-package verification remain.

Tasks:

1. Pin a supported LangGraph.js range as a peer dependency.
2. Implement `createJevRouter()` returning a conditional-edge-compatible async function.
3. Infer the route union from the `routes` object.
4. Support `selectState(graphState)` to minimize data disclosure and request size.
5. Provide fallback-node and fallback-evaluator options.
6. Provide hooks compatible with LangGraph run configuration without importing private APIs.
7. Test against an actual compiled `StateGraph`, not only mocks.
8. Add migration examples from an LLM structured-output router.

Exit gate: examples compile against the minimum and latest supported LangGraph.js versions and all
routes remain statically checked.

### Phase 4 — examples

Create two small, audited examples:

- `examples/langgraph-router`: search/calculation/direct-answer/human graph with deterministic test
  fixtures and an optional live mode.
- `examples/ai-sdk-fastlane`: simple/complex/refuse model routing that shows the provider-neutral
  core outside LangGraph.

Each example must include an architecture diagram, expected cost boundary, sample output, and a
test mode that runs without credentials.

### Phase 5 — benchmark suite

Baselines:

1. deterministic keyword/rule router;
2. small general-purpose LLM with structured output;
3. frontier LLM with structured output;
4. Jev with no fallback;
5. Jev with confidence-gated LLM fallback.

Datasets:

- a synthetic, fully redistributable routing dataset for CI smoke tests;
- one realistic, human-labeled dataset with ambiguous and adversarial cases;
- separate calibration and held-out test partitions;
- dataset cards documenting origin, license, label protocol, limitations, and hashes.

Measurements:

- route accuracy, macro F1, per-route precision and recall;
- coverage versus accuracy at each confidence threshold;
- expected calibration error and reliability curve;
- p50, p95, p99 latency and timeouts;
- input tokens and billed cost per 1,000 decisions;
- fallback frequency and total graph nodes executed;
- cold and warm runs reported separately.

Statistical method:

- at least 30 timing repetitions per configuration after declared warm-up;
- bootstrap 95% confidence intervals for latency and accuracy differences;
- paired comparisons on identical cases;
- no removal of outliers unless a predeclared infrastructure-failure rule applies;
- raw samples, commit SHA, package lock hash, timestamps, region, runtime, and hardware captured in
  a machine-readable result manifest.

Performance claim gate: publish a claim only if its confidence interval supports the stated
direction and routing quality remains above the predeclared floor. Otherwise publish a neutral or
negative result.

### Phase 6 — hardening and release

1. Run package tarball inspection and install each tarball in a clean consumer fixture.
2. Test ESM imports, declaration files, source maps, and tree shaking.
3. Run dependency, secret, license, and supply-chain scans.
4. Complete the threat-model checklist and dependency review.
5. Generate API documentation from source and verify links.
6. Publish `0.1.0` as pre-alpha with npm provenance.
7. Collect integration feedback before stabilizing policy and telemetry interfaces.
8. Release `1.0.0` only after two adapter versions and the benchmark protocol have remained stable.

## 5. Testing strategy

The test pyramid is intentionally offline-first:

- Unit: pure policy logic, normalization, errors, retry decisions.
- Type: public inference and expected compiler failures.
- Contract: recorded provider shapes passed through injected transport.
- Integration: real LangGraph graphs with fake evaluators.
- Live: minimal Jev smoke tests, manually or nightly triggered with a cost cap.
- Consumer: install packed artifacts into empty ESM projects on supported Node versions.
- Benchmark: separate from correctness tests and never required for ordinary pull requests.

CI must never expose secrets to pull requests from forks. Live tests must not run on untrusted code.

## 6. Security and privacy

- Keep gateway credentials server-side.
- Encourage minimal state projection before any provider call.
- Never log input state by default.
- Treat route descriptions and returned metadata as untrusted data.
- Bound serialized state size before transmission.
- Avoid dynamic code execution, template interpolation into source, and hidden network calls.
- Document Jev and gateway data-handling terms rather than claiming zero retention.
- Use constant declared route sets; reject provider-returned values outside them.
- Provide hooks for redaction and application-level audit correlation IDs.

See `docs/THREAT_MODEL.md` for abuse cases and mitigations.

## 7. Compatibility and versioning

- Runtime: Node.js 22+ initially; expand only with CI evidence.
- Module format: ESM first. Add CommonJS only if demonstrated consumer demand outweighs complexity.
- TypeScript: support the current and previous minor releases when practical.
- Dependencies on AI SDK and LangGraph are peers to avoid duplicate framework installations.
- Semantic Versioning governs public types, runtime behavior, event shapes, and error codes.
- Experimental upstream APIs are isolated in the AI SDK adapter and may require adapter minor
  releases; core remains stable.

## 8. Documentation deliverables

Before `0.1.0`:

- five-minute quick start;
- API reference;
- LangGraph migration guide;
- confidence-threshold tuning guide;
- fallback design guide;
- privacy and state-projection guide;
- benchmark reproduction guide;
- troubleshooting matrix;
- compatibility table and explicit project-status badge.

## 9. Release and maintenance

- Changesets generate version proposals and changelogs.
- Protected `main` requires CI and review once hosted.
- Releases are built from clean tags in CI, not developer laptops.
- npm publishes use provenance and two-factor authentication.
- Security reports follow `SECURITY.md` and receive acknowledgment within the stated window.
- Deprecations receive at least one minor-release warning before removal unless security requires an
  immediate change.

## 10. Milestone checklist

| Milestone | Outcome | Evidence |
| --- | --- | --- |
| M0 | Trustworthy repository foundation | CI, policies, clean install |
| M1 | Provider-neutral router | core tests and type tests |
| M2 | Jev connectivity | offline contracts and live smoke test |
| M3 | LangGraph integration | compiled graph integration tests |
| M4 | Reproducible comparison | public datasets and raw results |
| M5 | Pre-alpha release | packed consumer verification and provenance |
| M6 | Stable release | API stability and adoption feedback |

## 11. Immediate next work

1. Complete and test the first `jev-router-core` acceptance-policy vertical slice.
2. Add ADR-0003 after inspecting the live AI SDK evaluation response and public types.
3. Create a 100-case synthetic dataset and label schema.
4. Implement the injected AI SDK evaluator with recorded fixtures.
5. Compile a minimal four-node LangGraph integration against the adapter.

No performance percentage belongs in the README until Phase 5 produces reproducible evidence.
