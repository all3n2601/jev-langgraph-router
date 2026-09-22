# Exploratory paired pilot — 2026-09-22

This is a small, clean-commit smoke benchmark, not evidence of general Jev superiority. It used
eight held-out synthetic prompts, one request per prompt per provider, sequential execution, no
warmup, no retries, and no monetary cost calculation. The exact cases, model versions, runtime,
hardware, dependency lock hash, request settings, and source commit are recorded in
[`manifest.json`](./manifest.json). All 16 per-request observations are in
[`samples.jsonl`](./samples.jsonl); aggregate metrics are in [`summary.json`](./summary.json).

| Provider | Correct | Successful calls | Median observed latency | p95 observed latency |
| --- | ---: | ---: | ---: | ---: |
| Jev (`jev-1.13.0`) | 8/8 | 8/8 | 272 ms | 452 ms |
| OpenAI (`gpt-4o-mini-2024-07-18`) | 7/8 | 8/8 | 1,045 ms | 3,201 ms |

The LLM routed `calculate-06` to `answer`; Jev matched the label. With eight simple synthetic
cases, single measurements, and one machine/network environment, these numbers are exploratory.
The much larger repeated and realistic-data study described in
[`docs/BENCHMARKING.md`](../../../../docs/BENCHMARKING.md) remains necessary before a public
performance claim.

To rerun this pilot with your own credentials in the ignored root `.env` file:

```sh
pnpm benchmark --providers jev,openai --openai-model gpt-4o-mini --limit 8 --max-requests 16 --live
```
