# Changelog

All customer-visible changes to the Authbound public SDK are recorded here.

## Unreleased

- Return field-specific, value-safe validation errors consistently from the
  Next.js, Nuxt, Express, and Hono framework handlers.
- Compatible fixes intended for the first official platform release should
  target `0.1.6`.
- Keep `@authbound/nextjs` middleware helpers available from the root entry for
  `0.1.x` compatibility, while documenting `@authbound/nextjs/middleware` as
  the preferred import for Next.js middleware and proxy files.
- Harden Next.js, Nuxt, React, and server package artifact validation for
  client directives, Edge-safe entrypoints, webhook exports, and package
  contents.
- Document staging API overrides for SDK examples used in internal release
  testing.
- Add the manual SDK release process and check-only `sdk-v*` release workflow.

## 0.1.5

- Current aligned public SDK package set.
- Baseline SDK version for the first official platform release planning cycle.
