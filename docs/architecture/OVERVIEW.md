# Architecture overview

## Design principles

1. **Closed-world routing:** callers declare every permissible route.
2. **Provider isolation:** upstream experimental APIs are contained in one adapter.
3. **Policy before framework:** acceptance and fallback behavior lives in pure core code.
4. **Safe uncertainty:** low confidence is an expected result with an explicit policy.
5. **Minimal disclosure:** callers can project graph state before it leaves their process.
6. **Measurable claims:** performance evidence is versioned alongside the code.

## Component boundaries

```text
LangGraph state
      |
      v
state projector ---- application-owned, pure when possible
      |
      v
LangGraph adapter --- translates graph inputs/outputs only
      |
      v
core router --------- validation, acceptance, fallback, telemetry
      |
      v
direct TypeSafe SDK adapter (default) or AI SDK Gateway adapter (optional)
      |
      v
Jev
```

No package may reach across these boundaries to import an internal module from another package.
Only documented package exports are shared.

## Trust boundaries

Graph state and credentials are trusted application inputs. Provider responses, provider metadata,
route descriptions, serialized state, and telemetry sinks cross trust boundaries. All provider
outputs are validated locally before a route is returned.

## Extension points

- evaluator implementations;
- acceptance policies;
- fallback policies;
- state projection;
- telemetry callbacks;
- clock and retry scheduler injection for deterministic tests.

Extension callbacks receive immutable values where practical. A telemetry callback failure is
reported separately and must never alter a completed routing decision.
