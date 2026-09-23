# Bitext retail/e-commerce review set v1

## Origin and permitted use

Source: [Bitext Retail (eCommerce) Tagged Training Dataset for LLM-based Virtual
Assistants](https://huggingface.co/datasets/bitext/Bitext-retail-ecommerce-llm-chatbot-training-dataset),
revision `12dd624ddcd3057382b2faad661bcda1fa869491`, source CSV SHA-256
`13a988266fed4e2b2c1ff947a89ef220ce09b5b13ac83c4a1496c0d7b81e8127`.
The dataset card describes 44,884 hybrid-synthetic request/response pairs and a
`CDLA-Sharing-1.0` license. Attribute Bitext and follow the source license for any shared
extract or derivative dataset. The importer does not commit source prompts to this
Apache-2.0 software repository.

## Intended evaluation

This is an **external, intent-stratified challenge set** for the post-purchase routing
workflow, not a natural-prevalence sample of real merchant traffic. The importer selects
20 distinct requests from each of six source intents: `refund_policy`, `return_policy`,
`track_order`, `track_delivery`, `human_agent`, and `cancel_order`. Selection uses a fixed
SHA-256 ranking seed, `jev-bitext-postpurchase-v1`, and keeps four cases per intent for
calibration and sixteen for held-out testing. The source revision, bytes, row count, and
source-order IDs are checked or recorded for reproducibility.

This selection deliberately includes some ambiguous cases, such as questions *about*
cancellation versus requests to *perform* cancellation. Bitext's intent is **not** our
ground-truth route. Two independent reviewers must label the first safe next action under
the frozen [post-purchase rubric](../postpurchase-support-v1/PLAN.md), without seeing model
predictions or source intents. An adjudicator resolves disagreements. Only then does the
finalizer create a benchmark-compatible JSONL file.

There are no supported arithmetic requests in this source selection, so it cannot assess
`calculate`. It also cannot establish production accuracy or safety, because it is synthetic,
intent-stratified, and may contain near-paraphrases across splits. Report its results
separately from the in-repo synthetic sanity check and any future real-traffic study.

## Local preparation

From the repository root:

```sh
pnpm dataset:bitext
```

This downloads the pinned CSV, verifies its checksum, and creates ignored local files under
`benchmarks/results/raw/bitext-retail-ecommerce-v1/`:

- `review.jsonl`: the 120 selected requests with blank `reviewer1`, `reviewer2`, and `label` fields;
- `provenance.jsonl`: corresponding source row, intent, and category, kept separate from reviewers;
- `source.json`: source attribution, hashes, sampling settings, and counts.

Do not send `provenance.jsonl` or model results to reviewers before labeling. On each
`review.jsonl` line, set `reviewer1` and `reviewer2` to one of `answer`, `search`,
`calculate`, or `human`; set `label` to the adjudicated route. Add an `adjudicationNote`
when the two reviewers disagree. Preserve IDs, inputs, and splits. Then run:

```sh
pnpm dataset:bitext:finalize
```

The finalizer refuses incomplete reviews and writes an ignored `cases.jsonl` for
`pnpm benchmark --dataset ... --routes benchmarks/datasets/postpurchase-support-v1/routes.json`.
Neither preparation nor finalization overwrites an existing output. Retain the source
revision, review records, agreement rate, and rubric version with any report.

## Optional Claude draft reviewers

Two blind Claude labeling packets can be prepared locally with:

```sh
pnpm dataset:bitext:agents:prepare
```

Each packet contains only request IDs and text, in a different order, plus the same
[frozen agent rubric](./AGENT_LABELING.md). Neither packet contains Bitext intents,
calibration/test splits, the other agent's labels, or router predictions. Separate
tool-free Claude sessions can fill `agent-a/labels.jsonl` and `agent-b/labels.jsonl`.
The supplied runner does this in batches of 20, with a per-call budget cap:

```sh
pnpm dataset:bitext:agents:run-a
pnpm dataset:bitext:agents:run-b
pnpm dataset:bitext:agents:merge
```

The runner uses the local Claude Code login. If it reports an expired OAuth session, run
`claude auth login` interactively and retry each unfinished agent; completed batches are
kept for resumption. Do not paste a credential into this repository or chat.

The merge writes `disagreements.md`/`.jsonl` and a broader `review-required.md`/`.jsonl`
covering disagreements, uncertainty, and every proposed human route. It **does not** fill
`review.jsonl`, create benchmark ground truth, or authorize a human-validated claim.
Claude-to-Claude agreement is not routing accuracy. Human review is still necessary,
especially for safety cases. Keep the locally generated packets and labels out of the
public software repository unless their dataset-license obligations are handled separately.

If a person adjudicates **all** agent disagreements in the ignored local
`user-adjudications.json` (an object with a `labels` array of `{ "id", "label" }` records),
`pnpm dataset:bitext:agents:provisional` creates a separate, ignored
`provisional-cases.jsonl`. This research-only set uses the person's choices for
disagreements and two-agent consensus elsewhere. It also produces per-case label
provenance, a manifest, and `remaining-review.jsonl` for agreed human routes and
uncertain cases. It never changes the original reviews or produces the human-validated
`cases.jsonl`. Any comparison against it measures agreement with **provisional AI-assisted
labels**, not accuracy against ground truth. Do not present it as a product-level win.
