# Contributing

Thank you for helping improve the project.

## Before opening a change

1. Search existing issues and architecture decisions.
2. Open a design discussion before changing public types, package boundaries, benchmark protocol,
   data collection, or security behavior.
3. Keep provider and framework concerns out of `jev-router-core`.
4. Add tests and documentation with behavior changes.
5. Add a Changeset for any publishable package change after releases are enabled.

## Local checks

```sh
pnpm install
pnpm check
pnpm build
```

Live provider tests are opt-in and must never be required for an untrusted pull request. Do not
commit credentials, private prompts, customer data, or benchmark inputs without redistribution
rights.

## Commit and pull-request expectations

- Explain the problem, design, alternatives, and verification.
- Keep changes scoped and preserve package dependency direction.
- Identify breaking behavior explicitly.
- For performance changes, include raw measurements and the benchmark manifest.
- Confirm that generated code and third-party material have compatible licenses.

By contributing, you agree that your contribution is licensed under Apache License 2.0.
