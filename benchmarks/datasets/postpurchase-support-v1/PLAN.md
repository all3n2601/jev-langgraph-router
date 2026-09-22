# Post-purchase support routing study — proposed v1

## Product question

For a merchant's post-purchase support assistant, can Jev choose the **first safe next node**
faster or more cheaply than a structured-output LLM while meeting the same routing-quality and
human-review safety floor? This is a decision-only benchmark; it does not measure answer quality,
search relevance, refund correctness, or full conversation resolution.

This is the first target workflow because the four routes map to distinct operational actions,
cases can be reviewed by support staff, and routing mistakes have observable consequences. It
also lets us test the critical `human` fallback rather than only easy factual questions.

## Fixed v1 route rubric

| Route | First mandatory safe action | Example, not dataset data |
| --- | --- | --- |
| `answer` | Answer from the merchant's frozen, locally available policy/FAQ snapshot | “What is your standard return window?” |
| `search` | Read live order, shipment, inventory, or updated policy information | “Where is my order?” |
| `calculate` | Compute from all numbers already supplied in the request and frozen policy | “Three $12 items are eligible for a full refund; what is the total?” |
| `human` | Request approval/review before a refund, account change, exception, fraud-sensitive action, or high-stakes judgment | “Approve a $700 refund to a new card.” |

Freeze the exact FAQ/policy snapshot and route descriptions before labeling. A policy explanation
is `answer`; granting an exception is `human`. A refund amount that depends on live order data is
`search` first, unless approval is required before looking anything up. Human approval takes
precedence over lookup or arithmetic. Reviewers label the next node, not the final answer.
The proposed descriptions are versioned in [`routes.json`](./routes.json). Pass that file to the
harness with `--routes benchmarks/datasets/postpurchase-support-v1/routes.json` for both providers.

## Data to collect

- Source: consecutive, permissioned post-purchase requests from one merchant and one support
  channel over a stated date range. Exclude pre-purchase sales and unrelated technical support.
- Target: 200 naturally occurring eligible requests plus up to 80 separately reported challenge
  cases. Do not balance the natural sample or select it based on model errors.
- Redaction: remove names, email, addresses, phone numbers, payment details, order IDs, tracking
  numbers, and free-text personal details. Preserve the *kind* of lookup needed, not identifiers.
- Context: include only the fields the deployed router will see. If a request requires an order
  record, do not insert the answer into the router input.
- Duplication: group requests from the same conversation/order before splitting. Keep each group
  wholly in calibration or test.
- Labeling: two independent support reviewers, blind to model predictions; third-party
  adjudication for disagreements. Record agreement, exclusion counts, and the adjudication
  rationale in a private sheet. Do not change labels after inspecting held-out model results.

Use an approximately 20/80 calibration/test split with a recorded seed. Challenge cases should
cover mixed intents, missing inputs, refunds above policy limits, policy exceptions, adversarial
instructions, and ambiguous wording. Report natural and challenge cohorts separately; otherwise
the combined score would misrepresent actual traffic prevalence.

## Benchmark handoff

The provider-input file follows [`../HUMAN_LABELING_PROTOCOL.md`](../HUMAN_LABELING_PROTOCOL.md):
one JSON object per line with `id`, redacted `input`, adjudicated `label`, and `split`. Keep a
separate dataset card with merchant/channel/date range, policy snapshot hash, consent/licensing,
sampling seed, labeling instructions, reviewer agreement, and redaction method. Do not commit
private requests to this public repository.

Run a small capped calibration smoke test first. Then freeze settings and run the full held-out
comparison. A public result needs per-route accuracy and `human` recall, paired latency with
repeated timing, actual billed cost, failure counts, and a signed-off privacy review. The
current synthetic pilot is not a substitute for any of those steps.

## Decision still needed from the merchant

Before live data collection, the merchant must approve the data use, define the exact policy and
approval boundaries, and predeclare an acceptable `human` recall floor. Without permissioned,
human-labeled cases, this plan remains a study design rather than a completed real-world test.
