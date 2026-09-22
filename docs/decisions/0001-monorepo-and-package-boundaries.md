# ADR-0001: Monorepo and package boundaries

- Status: Accepted
- Date: 2026-09-22

## Context

The routing policy, Jev transport, and LangGraph integration change at different rates. AI SDK's
evaluation interface is experimental, while the core policy should remain stable and testable
without network calls.

## Decision

Use a pnpm monorepo containing `jev-router-core`, `jev-ai-sdk-router`, and
`jev-langgraph-router`. Dependencies point from framework adapter to provider adapter to core.
Consumers may use the core or AI SDK adapter without installing LangGraph.

## Consequences

Upstream churn is isolated and tests can remain offline-first. The cost is release coordination
across three packages and additional workspace configuration.

## Alternatives

A single package was rejected because it would force unnecessary peer dependencies and couple the
stable policy interface to experimental provider APIs.
