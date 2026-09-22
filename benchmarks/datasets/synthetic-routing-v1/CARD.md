# Synthetic routing v1

- Origin: 100 original, manually written English prompts in this repository.
- License: Apache-2.0, matching the repository.
- Labels: `answer`, `search`, `calculate`, `human`; 25 examples each.
- Split: first five examples per label are calibration (20 total); remaining examples are held-out
  test (80 total). Do not tune prompts or thresholds using the test split.
- Intended use: smoke-testing routing comparisons and the benchmark harness.
- Limitations: short, English-only, unambiguous examples; no real users, ambiguous cases, or
  adversarial inputs. Results on this dataset do not establish production accuracy.
- Version: 1. The run manifest records a SHA-256 digest of the canonical generated cases.

The source cases and labels live in [`../../src/dataset.ts`](../../src/dataset.ts). Route
descriptions are shared verbatim by every model baseline.
