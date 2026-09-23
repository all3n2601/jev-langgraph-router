# Result registry

Curated benchmark summaries live here. Raw run directories under `runs/` are ignored by default.
A release result must attach immutable raw artifacts with recorded checksums before any public
performance claim. Small pilots are labeled exploratory and do not satisfy that gate.

The [2026-09-22 paired pilot](./runs/2026-09-22T18-59-43-489Z-44225/README.md) is deliberately
versioned with its raw samples for auditability, despite the normal ignore rule for local runs.
The [2026-09-22 expanded synthetic comparison](./runs/2026-09-22T19-20-57-184Z-52346/README.md)
likewise includes all 240 observations, its run manifest, summary, and comparison chart. It is
exploratory and does not pass the release-performance gate.

The [2026-09-23 Bitext comparison](./runs/2026-09-23T04-34-32-912Z-86396/README.md)
uses external hybrid-synthetic requests with **AI-assisted provisional labels**.
It includes raw observations and a chart, but 41 flags remain unreviewed and
human-route misses prevent any product-readiness claim.
