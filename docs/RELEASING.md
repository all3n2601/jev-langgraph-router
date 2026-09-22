# Release process

1. Confirm the milestone acceptance gate is satisfied.
2. Run `pnpm check` from a clean checkout.
3. Build every package and inspect generated declarations and source maps.
4. Pack every publishable package and install it in a clean consumer fixture.
   The automated `pnpm verify:packages` check covers tarball contents and an ESM import smoke test.
5. Verify package contents, license, README, exports, peer dependencies, and provenance settings.
6. Merge an approved Changeset version pull request.
7. Publish from protected CI using npm trusted publishing and provenance.
8. Create a signed Git tag and GitHub release containing the generated changelog.
9. Run smoke installations from the public registry.
10. For benchmark releases, attach immutable raw results and record their checksums.

Until hosting and trusted publishing are configured, releases must remain disabled.
