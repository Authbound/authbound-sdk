# Changelog

All customer-visible changes to the Authbound public SDK are recorded here.

## Unreleased

### Breaking changes

- Make credential-definition `create()` publish by default and enforce
  publication readiness more strictly. Credential-definition APIs now require
  lifecycle-discriminated complete responses, default listing returns only
  published definitions, and explicit draft workflows use `createDraft()`,
  `update()`, and `publish()`.

### Changes

- Document credential-definition lifecycle recovery for issuer examples: a
  known owned draft can be published with an idempotency key, while published
  definitions are immutable and archived definitions require a new ID and VCT
  version.

## 0.2.2 - 2026-08-26

### Changes

- Restore verification startup under React Strict Mode so effect replay no
  longer disposes and reuses a terminal browser flow before the request is
  sent.
- Reuse identical in-flight verification starts and reject conflicting
  concurrent identity options before sending a second create request.
- Serialize SDK-managed browser session creation and finalization across tabs,
  clients, controllers, and framework adapters on the same browser origin.
  Browsers without a usable Web Locks API now fail closed before the request;
  app-owned manual sessions remain available.
- Apply the same session coordination to the Nuxt fallback client. Shared
  parent-domain cookies spanning multiple browser origins require
  `sessionMode: "manual"` with app-owned server-side coordination.

## 0.2.1 - 2026-08-26

### Changes

- Make `@authbound/nextjs/styles.css` self-contained so Tailwind CSS v4 and
  other PostCSS pipelines do not need to resolve a nested package import.

## 0.2.0 - 2026-08-26

### Breaking changes

- Remove the legacy `eudiplo` provider identifier. Applications that still
  send or compare that value must migrate to `eudi` before upgrading.
- Require webhook events to use `api_version: "v1"` and include a string
  `contract_revision`. Update custom webhook fixtures, producers, and parsers
  to provide both fields; the SDK now rejects older event shapes.

### Changes

- Add verification policy management APIs for creating, listing, reading, and
  archiving project policies.
- Add EUDI verifier provider options and `dc_api` wallet handoff support across
  the core, server, and framework packages.
- Expand and harden station runtime support, including portrait data URIs,
  operator grants, public display flows, and verification disclosures.
- Send versioned API contract headers from clients and status helpers, and
  publish the corresponding contract metadata.
- Return field-specific, value-safe validation errors consistently from the
  Next.js, Nuxt, Express, and Hono framework handlers.
- Keep `@authbound/nextjs` middleware helpers available from the root entry for
  `0.1.x` compatibility, while documenting `@authbound/nextjs/middleware` as
  the preferred import for Next.js middleware and proxy files.
- Harden Next.js, Nuxt, React, and server package artifact validation for
  client directives, Edge-safe entrypoints, webhook exports, and package
  contents, and make clean-checkout release typechecks deterministic.
- Correct the pension issuer example's language claim, document staging API
  overrides for release testing, and add the manual `sdk-v*` release process.

## 0.1.5

- Current aligned public SDK package set.
- Baseline SDK version for the first official platform release planning cycle.
