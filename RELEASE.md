# Authbound Public SDK Release Process

The public SDK is released manually, with CI proving readiness but never
publishing to npm. This keeps credentials out of GitHub Actions while making the
release repeatable.

## Version Policy

- `scripts/release-set.mjs` is the source of truth for the dependency-closed
  package set and release version.
- Publish the interdependent Authbound packages as one coherent version set so
  framework adapters cannot resolve an older core or server runtime.
- Compatible fixes use patch releases; breaking pre-1.0 changes use minor
  releases with a separate release plan.
- The current breaking-contract baseline is `0.3.0`; compatible fixes use
  later `0.3.x` patch releases.
- SDK tags use `sdk-v<version>`, for example `sdk-v0.3.0`.
- Breaking SDK changes require a separate release plan before publishing.

### Historical 0.2.0 Breaking-Change Plan

Before upgrading, replace the legacy `eudiplo` provider identifier with
`eudi`. Webhook integrations must accept and emit `api_version: "v1"` and a
string `contract_revision`; update custom fixtures, producers, and parsers
before deploying the new SDK. Publish all six packages together so framework
adapters and their shared contracts remain aligned.

## Commit Convention

Use short conventional prefixes so release notes stay scannable:

- `feat:` customer-visible SDK capability
- `fix:` customer-visible bug fix
- `docs:` docs, examples, comments, or changelog only
- `chore:` maintenance with no customer-facing behavior change
- `ci:` workflow or release automation change
- `sdk:` legacy pre-process SDK maintenance commits; prefer the typed prefixes
  above for new release work

## Release Checklist

1. Merge all SDK fixes intended for the release into `main`.
2. Update the release version in `scripts/release-set.mjs`, then bump every
   package in its dependency-closed release set. Keep internal source
   dependencies as `workspace:*`; packed manifests must rewrite them to the
   exact release version.
3. Update `CHANGELOG.md` with the customer-visible changes.
4. Run:

   ```bash
   pnpm install --frozen-lockfile
   pnpm release:check
   ```

5. Confirm `release:check` packed the release set into isolated consumers,
   compiled the public lifecycle APIs, and proved each framework adapter
   resolves the exact release-version Authbound dependencies without workspace
   links or live Authbound requests.
6. Commit the version and changelog update.
7. Tag the exact release commit:

   ```bash
   git tag -a sdk-v0.3.0 -m "Authbound SDK 0.3.0"
   git push origin main sdk-v0.3.0
   ```

8. Wait for the `SDK Release Check` workflow to pass on the tag.
9. From the mono repo root, run:

   ```bash
   pnpm sdk:publish -- --dry-run
   ```

10. After approval, publish manually from the mono repo root:

   ```bash
   pnpm sdk:publish -- --tag latest
   ```

11. Record the SDK commit, tag, npm version, and publish result in the platform
    release evidence.

## CI Boundary

GitHub Actions reads the affected set from `scripts/release-set.mjs`, then runs
install and `pnpm release:check` for `workflow_dispatch` and `sdk-v*` tags. It
does not run `npm publish` and must not receive npm tokens.
