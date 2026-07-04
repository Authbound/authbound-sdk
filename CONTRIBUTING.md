# Contributing to Authbound Public SDK

Authbound Public SDK is a workspace of publishable packages under `packages/*`.
This document covers how to contribute safely and how to prepare releases.

## Development setup

```sh
cd packages/public-sdk
pnpm install --frozen-lockfile
pnpm install
```

To run the workspace in watch mode:

```sh
pnpm dev
```

## Code quality gates

- Format and lint: `pnpm lint`
- Type check: `pnpm check-types`
- Build all SDK packages: `pnpm build`
- Package tests: `pnpm -r --filter './packages/*' run test`

Use `--filter` for focused work:

```sh
pnpm --filter @authbound/server test
pnpm --filter @authbound/server typecheck
pnpm --filter @authbound/server build
```

## Workflow conventions

- Keep changes scoped to one package when possible.
- Keep public SDK APIs intentionally additive.
- Add/adjust tests in the affected package.
- Avoid introducing new examples unless they document a distinct public flow.
- Do not add private or PII data into `credentialDefinitions` metadata or labels/aliases.
- Use short conventional commit prefixes: `feat:`, `fix:`, `docs:`, `chore:`, or `ci:`.

## Releases

Use [`RELEASE.md`](./RELEASE.md) for SDK versioning, release tags, checks, and
manual npm publishing. CI proves release readiness; npm publishing stays manual.

## Repository structure

- `packages/core` — protocol-agnostic SDK core
- `packages/server` — Authbound server SDK client
- `packages/react` — React package
- `packages/vue` — Vue package
- `packages/nextjs` — Next.js helper package
- `packages/nuxt` — Nuxt module
