# Changelog

All customer-visible changes to the Authbound public SDK are recorded here.

## Unreleased

## 0.2.0 - 2026-08-26

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
