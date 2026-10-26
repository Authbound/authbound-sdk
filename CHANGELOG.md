# Changelog

All customer-visible changes to the Authbound public SDK are recorded here.

## 0.5.0 - Unreleased

### Breaking changes

- Send API contract revision `v1.2026-10-24.1`. Verification results return
  disclosed claims by pull only: `getResult()` now returns `claimsStatus`
  (`available`, `expired`, or `none`), and `claims` with `claimsSalt` while
  they are available, for 15 minutes after the verification completes. The
  `assertions` field is removed. Claims are keyed by their disclosed paths,
  for example `{ age_equal_or_over: { "18": true } }` or
  `{ "eu.europa.ec.av.1": { age_over_18: true } }`.
- Remove `verified_outputs`, `VerifiedOutputs`, and `VerifiedOutputsSchema`
  from webhook types. Webhooks and events never carry claims.
- Remove the `missing_requested_assertions` failure code, which the API no
  longer returns.
- Remove the `vcs` verification provider. `provider` accepts `auto` or `eudi`.
- Replace `age` and `dateOfBirth` in the SDK session cookie and verification
  context with `ageClaims`, the disclosed age claims unchanged. `minAge` route
  requirements are met by `age_over_M: true` or `age_equal_or_over.M: true`
  with M at least `minAge`, or by a birth date at least `minAge` years before
  today in UTC. Sessions created by earlier SDK versions no longer satisfy
  `minAge`; users verify again.
- Remove `calculateAge`, `calculateAgeFromDob`, `Dob`, `DobSchema`, `Sex` and
  `SexSchema`. Use `meetsMinimumAge` on disclosed age claims instead of
  deriving an age.

### Migrating from 0.4

```ts
// 0.4
const result = await client.verifications.getResult(id);
if (result.assertions?.age_over_18 === true) grantAccess();

// 0.5: claims keep their disclosed paths and are readable for 15 minutes.
const result = await client.verifications.getResult(id);
if (result.claimsStatus === "available" && meetsMinimumAge(result.claims, 18)) {
  grantAccess();
}
```

Webhook handlers that read `event.data.object.verified_outputs` call
`getResult()` for the claims instead. Code that read `verification.age` from
the SDK session checks `meetsMinimumAge(verification.ageClaims, minAge)`.

### Changes

- Add `client.verifications.verifyResultToken(resultToken, { verificationId })`
  and a standalone `verifyResultToken(resultToken, { keys, issuer,
  verificationId })`. They check the ES256 signature against the deployment's
  `/v1/jwks`, `iss`, `sub`, optionally `aud`, and `exp`, and throw
  `ResultTokenVerificationError` otherwise. `resultIssuer` sets the expected
  `iss` when it is not the origin of `apiUrl`.
- Add `verifyClaimsDigest(claims, claimsSalt, verifiedResultToken)`. It checks
  a verified token's `claims_sha256` against the RFC 8785 canonical JSON of the
  claims and salt, and refuses a token `verifyResultToken` did not return.
- Export `meetsMinimumAge` from `@authbound/server`, and `ClaimsStatus` and
  `ClaimsStatusSchema` from `@authbound/core`.
  `@authbound/nextjs/server` re-exports `verifyResultToken`,
  `verifyClaimsDigest` and `meetsMinimumAge`.
- Reject browser status payloads that include `claims` or `claims_salt`.
- Accept server-owned `providerOptions` in the Next.js, Express and Hono
  handlers, sent with every verification they create. Customer-controlled EUDI
  verifiers start a wallet request only for an explicit HAIP request.
- Release all six interdependent packages together at `0.5.0`.

## 0.4.0 - 2026-09-24

### Breaking changes

- Remove `returnAttrs` from `policies.create()`. Every selected claim is now
  requested, required, and returned. Existing saved policies keep their stored
  output selections. Create a new policy to change its requirements.
- The matching API rejects `return_attrs` on policy creation. Upgrade policy
  creation clients together with that API deployment.
- EUDI PID nationality results retain the credential's array shape. Consumers
  of those results must handle an array; Authbound PID scalar nationality is
  unchanged.

### Changes

- Accept typed policy requirements such as
  `{ claim: "age_over_18", values: [true] }` in `requestedClaims`.
- Validate requested claims and primitive constraints before sending a request,
  including duplicate output names and unsafe numeric values.
- Release all six interdependent packages together at `0.4.0`.

## 0.3.0

### Breaking changes

- Make credential-definition `create()` publish by default and enforce
  publication readiness more strictly. Credential-definition APIs now require
  lifecycle-discriminated complete responses, while default listing follows the
  backend active view and can include owned drafts. Use
  `list({ lifecycleStatus: "published" })` for published-only results, and use
  `createDraft()`, `update()`, and `publish()` for explicit draft workflows.

### Changes

- Release core, server, React, Vue, Next.js, and Nuxt together at `0.3.0` so
  every framework adapter resolves the updated runtime contracts.
- Preserve structured unsupported and missing claim names from public API
  errors so issuer integrations can correct rejected credential payloads.
- Document credential-definition lifecycle recovery for issuer examples: a
  known owned draft can be published with an idempotency key, and concurrent
  first-use creation reuses a deterministic key. Published definitions are
  immutable and archived definitions require a new ID and VCT version.
- Pass verification `expiresAt` through status subscriptions so SSE fallback
  polling can continue beyond five minutes when valid, stops at the
  authoritative verification expiry, and preserves request abort and cleanup
  behavior on reset or unmount.

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
