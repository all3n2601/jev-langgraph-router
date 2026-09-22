# Threat model

## Protected assets

- AI Gateway credentials;
- private graph state and user content;
- routing integrity;
- audit and benchmark integrity;
- downstream tools and side effects selected by a route.

## Principal threats and mitigations

| Threat | Mitigation |
| --- | --- |
| State includes secrets or excess personal data | Explicit state projector; no state logging by default |
| Provider returns an invented route | Validate against the declared route set |
| Low-confidence decision triggers a dangerous action | Threshold and fail-closed fallback policy |
| Prompt injection in graph state changes routing intent | Fixed question and route criteria; local allowlist validation |
| Request hangs or retries indefinitely | End-to-end timeout, abort propagation, bounded retries |
| Telemetry leaks state | Metadata-only default events and redaction hook |
| Telemetry callback alters control flow | Isolate callback errors from completed decisions |
| Malicious benchmark data falsifies claims | Dataset hashes, raw samples, paired cases, reproducible scripts |
| Dependency compromise | Lockfile, minimal dependencies, review automation, provenance |
| Model behavior changes without a version signal | Record all available metadata, timestamps, and repeated controls |

## Out of scope

The library cannot guarantee the correctness of route criteria, the safety of downstream graph
nodes, provider uptime, or provider data retention. Applications remain responsible for approval
boundaries around irreversible or high-impact actions.
