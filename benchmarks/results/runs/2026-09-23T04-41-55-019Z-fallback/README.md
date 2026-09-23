# Exploratory full-graph safety evaluation — 2026-09-23

This run sent the same 96 held-out [Bitext retail/e-commerce](https://huggingface.co/datasets/bitext/Bitext-retail-ecommerce-llm-chatbot-training-dataset)
requests through the runnable LangGraph example, using the frozen post-purchase
route descriptions and its pre-existing fallback thresholds (minimum route
probability 0.8, minimum provider confidence 0.6). The source is
hybrid-synthetic, intent-stratified, and licensed `CDLA-Sharing-1.0`.
The route labels are **AI-assisted provisional**, not human-validated ground truth;
41 selected cases still require human review. No threshold was tuned on this
test split. The run used commit `52a58a1` and one graph invocation per case.

| Outcome | Cases |
| --- | ---: |
| Graph calls completed | 96/96 |
| Final route matched provisional label | 62/96 |
| Provisional `human` cases sent to human | 24/24 |
| Non-`human` cases also sent to human | 33/72 |
| Fallbacks due to route probability below 0.8 | 42/96 |

Of the 24 provisionally labeled `human` cases, Jev selected `human` directly
on 15 and the policy redirected nine low-probability choices to `human`.
Both user-adjudicated `human` cases (`bitext-003685`, `bitext-004301`) were
caught by that fallback. All 33 non-`human` cases sent to a person were also
low-probability fallbacks. This is a safety–workload tradeoff, not a demonstrated
production safety guarantee: the denominator still depends on provisional labels.

The earlier [raw-choice comparison](../2026-09-23T04-34-32-912Z-86396/README.md)
found Jev matched 78/96 provisional labels and 16/24 provisional `human` cases.
This is a **separate live run**, so the change in counts cannot be attributed
solely to fallback thresholds; responses may vary between calls. A paired
same-response policy analysis would be needed for exact attribution.

`observations.jsonl` has case IDs, expected and chosen routes, the raw route,
decision reason, and probability/confidence—no request text or credentials.
`summary.json` records counts and input hashes. The ignored local source
prompts and provisional-label provenance are required to reconstruct the run.
Human adjudication of the remaining flagged cases and representative real
traffic are required before readiness or performance claims.
