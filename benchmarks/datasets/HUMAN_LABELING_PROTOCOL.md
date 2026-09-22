# Human-labeled routing dataset protocol

This is the design for the first realistic evaluation. It does **not** claim that the current
synthetic dataset is representative. Before collecting cases, name one target workflow and freeze
the four route descriptions for that workflow. The example routes below match the current
LangGraph demo; revise them if the chosen workflow differs.

## What one case represents

Each case is the exact, redacted user request visible at one graph decision point, with the one
**next action** a well-designed application should take. It is not a full conversation answer.
Include only context that the deployed router would actually receive. Keep customer identifiers,
account numbers, credentials, private documents, and personal health details out of the dataset.
Obtain organizational permission before sending any real request to both benchmark providers.

## Label rubric

| Label | Correct next action | Examples of exclusion |
| --- | --- | --- |
| `answer` | Answer from stable knowledge already available in the application | Requires a live lookup, calculation, or approval |
| `search` | Retrieve current, external, or account-specific information | The needed facts are already in the request |
| `calculate` | Compute a deterministic numeric result from supplied values | A current price or other missing value must first be fetched |
| `human` | Obtain approval or expert review before a high-stakes or irreversible action | Merely explaining a policy, without taking action |

For a request that spans multiple actions, label the **first mandatory safe step**. Human review
overrides other routes when approval is required before any action. Otherwise, retrieve missing
facts before calculating; calculate when all inputs are supplied; use `answer` only when neither
tool nor review is needed. If trained reviewers cannot agree using this rule, mark the case
`ambiguous` in a private labeling sheet and adjudicate it before inclusion. Do not silently force
an uncertain case into a label.

## Sampling and split

1. Start with consecutive, eligible requests from the chosen workflow over a stated date range.
   Do not select cases based on which model gets them right. Record the inclusion and redaction
   rules in a dataset card.
2. Keep the natural-prevalence sample separate from an intentional challenge set containing
   ambiguous, multi-intent, safety-sensitive, current-information, and prompt-injection cases.
   Report the two groups separately; a balanced challenge set is not production traffic.
3. For an initial study, aim for at least 200 naturally sampled requests and 80 challenge cases.
   If that is not feasible, publish the smaller sample and uncertainty honestly.
4. Assign approximately 20% of each source group to `calibration` and 80% to `test`, using a
   fixed documented random seed. Keep related requests from the same conversation or customer
   entirely in one split to prevent leakage.
5. Freeze the route text, model settings, and any threshold using calibration cases only. Do not
   inspect test outcomes and then revise the classifier for the same test report.

## Labeling quality

- Two reviewers label each case independently without seeing Jev or LLM predictions.
- Record both original labels, reviewer confidence, and disagreements outside the provider input
  file. A third reviewer adjudicates disagreements using the frozen rubric.
- Report raw agreement and per-route disagreement counts. Do not hide hard cases; report the
  exclusion count and reasons.
- Version the rubric and dataset. A revised label creates a new dataset version, not an in-place
  edit to a published benchmark.

## Accepted benchmark file

The harness accepts UTF-8 JSONL through `--dataset /absolute/path/to/cases.jsonl`:

```json
{"id":"request-0001","input":"A redacted request text","label":"search","split":"test"}
```

IDs must be unique; labels are `answer`, `search`, `calculate`, or `human`; split is
`calibration` or `test`. Keep the source data and adjudication sheet private if licensing or
privacy requires it. The run manifest records a SHA-256 digest of the parsed cases and the
selected case IDs, but not prompt text or the local file path. If results are published, provide
the dataset card, a legally shareable sample or access procedure, and exact reproduction steps.

## Evaluation gates

- Accuracy: report overall accuracy, macro F1, per-route precision/recall, and a confusion
  matrix. A failed or undeclared model response counts as incorrect.
- Safety: report false negatives for `human` separately. Predeclare a minimum acceptable recall
  for that route; a fast model that misses approvals cannot pass the product gate.
- Latency: measure paired cases with both provider orders represented, record failures and cold
  calls, and repeat a fixed representative subset at least 30 times if claiming a timing effect.
- Cost: use actual billed usage and versioned provider prices, not token counts alone. Declare
  credits and discounts.
- Claim: publish the raw run files, environment, model IDs, uncertainty intervals, and failure
  analysis. Do not claim a general improvement from the synthetic pilot or one workflow alone.
