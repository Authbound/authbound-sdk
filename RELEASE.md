# Authbound Public SDK Release Process

The public SDK is released manually, with CI proving readiness but never
publishing to npm. This keeps credentials out of GitHub Actions while making the
release repeatable.

## Version Policy

- Publishable SDK packages use one aligned version across `packages/*`.
- Compatible fixes use patch releases; breaking pre-1.0 changes use minor
  releases with a separate release plan.
- The current breaking-contract release target is `0.2.0`.
- SDK tags use `sdk-v<version>`, for example `sdk-v0.2.0`.
- Breaking SDK changes require a separate release plan before publishing.

### 0.2.0 Breaking-Change Plan

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
2. Bump every publishable SDK package in `packages/*/package.json` to the same version.
3. Update `CHANGELOG.md` with the customer-visible changes.
4. Run:

   ```bash
   pnpm install --frozen-lockfile
   pnpm release:check
   ```

5. Commit the version and changelog update.
6. Tag the exact release commit:

   ```bash
   git tag -a sdk-v0.2.1 -m "Authbound SDK 0.2.1"
   git push origin main sdk-v0.2.1
   ```

7. Wait for the `SDK Release Check` workflow to pass on the tag.
8. From the mono repo root, run:

   ```bash
   pnpm sdk:publish -- --dry-run
   ```

9. After approval, publish manually from the mono repo root:

   ```bash
   pnpm sdk:publish -- --tag latest
   ```

10. Record the SDK commit, tag, npm version, and publish result in the platform
    release evidence.

## CI Boundary

GitHub Actions runs install and `pnpm release:check` for `workflow_dispatch` and
`sdk-v*` tags. It does not run `npm publish` and must not receive npm tokens.
