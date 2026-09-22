# Benchmarks

The benchmark harness compares direct Jev, an OpenAI structured-output LLM router, and a fixed
rule baseline on the same labeled prompts. It writes a manifest, raw JSONL samples, and an
aggregate summary for every run. Ordinary tests use fake providers and never make API calls.

The [synthetic v1 dataset](./datasets/synthetic-routing-v1/CARD.md) has 100 original prompts:
20 calibration and 80 held-out test cases, balanced across four routes. It is a harness and
sanity-check dataset, not evidence of production routing quality.

First, run without credentials:

```sh
pnpm benchmark:offline --providers rule --limit 8
```

For a small paired live pilot, place `TYPESAFE_API_KEY` and `OPENAI_API_KEY` in the ignored root
`.env` file, then run:

```sh
pnpm benchmark --providers jev,openai --openai-model gpt-4o-mini --limit 8 --max-requests 16 --live
```

The LLM baseline uses the [OpenAI Responses API's strict JSON Schema
output](https://developers.openai.com/api/docs/guides/structured-outputs). Pass a model available
to your account with structured-output support; the script requires an explicit model ID. API
calls are sequential, retries are disabled, and the command refuses to exceed the stated live
request cap. Default runs select held-out cases in balanced round-robin order. Set `--split
calibration` only for tuning; never tune on held-out results. Run IDs and full outputs are in
`benchmarks/results/runs/`, which is ignored by Git so raw reports and local metadata are not
committed accidentally.

The summary reports availability, accuracy, macro F1, latency percentiles (including failed
calls), token counts, and paired case-bootstrap 95% intervals. It does not calculate cost without
verified prices. A pilot or synthetic dataset alone cannot justify a public performance claim;
the [methodology](../docs/BENCHMARKING.md) describes the larger release gate.

To evaluate real workflows, supply your own human-reviewed JSONL file with one object per line:

```json
{"id":"ticket-001","input":"A redacted user request","label":"human","split":"test"}
```

Pass `--dataset /absolute/path/to/cases.jsonl` to the same command. The four labels must match
the routes in `src/dataset.ts`; IDs must be unique. Keep calibration and test splits separate,
document who labeled the cases and how disagreements were resolved, and do not include sensitive
user data unless your organization has approved sending it to both model providers. The manifest
records a dataset hash but not its local path or prompt text. User-supplied dataset provenance and
license are **not verified** by the harness.
Use the [human-labeling protocol](./datasets/HUMAN_LABELING_PROTOCOL.md) to define a target
workflow, split cases, adjudicate labels, and set the safety gate before live evaluation.
The first proposed real workflow is [post-purchase support](./datasets/postpurchase-support-v1/PLAN.md).
For user-supplied data, `--limit` takes cases in file order; randomize that order with a recorded
seed before running a capped subset.
Use `--routes /absolute/path/to/routes.json` to provide the same frozen, workflow-specific route
descriptions to Jev and the LLM. The file must contain exactly the four supported route keys.
