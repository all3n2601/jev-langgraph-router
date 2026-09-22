# Changelog

Notable changes will be documented here once releases begin. The project follows Semantic
Versioning and will use Changesets to generate package-specific release notes.

## Unreleased

- Established the repository architecture, governance, security guidance, benchmark protocol, and
  implementation plan.
- Added the initial provider-neutral routing contract and tests.
- Separated selected-route probability from provider-specific confidence in the core contract.
- Added the offline-tested AI SDK/Jev evaluator with validation, cancellation, timeout, and retry
  pass-through behavior.
- Added a LangGraph conditional-edge adapter with explicit state projection and compiled-graph tests.
