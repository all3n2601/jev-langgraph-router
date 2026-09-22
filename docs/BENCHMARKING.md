# Benchmark methodology

The benchmark suite exists to test a falsifiable hypothesis: for closed-set routing decisions,
Jev can reduce latency or cost relative to a general-purpose LLM router while meeting a declared
quality floor.

## Required report fields

Every committed result must include:

- repository commit and dirty-state flag;
- lockfile digest and exact model identifiers returned by providers;
- date, region, Node.js version, operating system, CPU, and memory;
- dataset name, version, license, hash, split, and number of cases;
- concurrency, warm-up, repetition count, timeouts, retries, and rate limits;
- prompts, route definitions, thresholds, and fallback configuration;
- raw per-case latency, route, confidence, token usage, cost, and error category;
- aggregate methodology and confidence intervals.

## Fairness rules

- Run competitors on identical labeled inputs.
- Report cold and warm measurements separately.
- Separate provider latency from local adapter overhead when instrumentation permits.
- Include failures in availability and end-to-end latency statistics.
- Tune thresholds on a calibration split only.
- Do not use the test split to alter prompts or policies.
- Report accuracy alongside every cost or latency claim.
- Identify sponsored credits or non-public pricing.

## Result layout

```text
benchmarks/results/<run-id>/
├── manifest.json
├── samples.jsonl
├── summary.json
└── README.md
```

Raw results may be large and are ignored by default. A release benchmark must attach immutable raw
artifacts and commit a small signed summary with checksums and a durable download location.
