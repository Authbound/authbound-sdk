# Basic Issuer Agent Example

Small Node server that creates an Authbound credential definition, maps app data into claims, and returns an OpenID4VCI wallet offer URI.

## Run

```sh
pnpm install
cp .env.example .env
AUTHBOUND_SECRET_KEY=sk_test_... pnpm dev
```

Open `http://localhost:3000`, click **Create wallet offer**, then encode the returned `offerUri` as a QR code or open it with a compatible wallet.

## What It Shows

1. Initialize `AuthboundClient` with a server-side secret key.
2. Reuse its known published definition, publish only its own known draft, or create its complete definition when Authbound returns the typed not-found error.
3. Map business data into credential claims.
4. Call `authbound.openId4Vc.issuance.createOffer`.
5. Return `offer.offerUri` to your website.

This runnable example owns the complete `employee_badge_v1` definition, so its recovery helper may publish that exact known draft with a deterministic idempotency key. It never discovers drafts and bulk-publishes them. An archived definition stops with guidance to create a new ID and VCT version.

`authbound.issuer.credentialDefinitions.create()` creates and returns a published definition. For intentional staging, use `authbound.issuer.credentialDefinitions.createDraft()` and inspect the owned draft before calling `authbound.issuer.credentialDefinitions.publish()`.

Published definitions are immutable. Change a definition by creating a new credential-definition ID and VCT version rather than editing the published version.

`metadata` is authenticated management metadata; it is not wallet-discoverable issuer or credential metadata. Do not put secrets or personal data in definition titles, claim labels, aliases, rendering, or metadata. `rendering` accepts only six-digit colors and Authbound-owned presets, not arbitrary SVG, HTML, CSS, or customer templates.
