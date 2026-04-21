# Basic Issuer Agent Example

Small Node server that creates an Authbound credential definition, maps app data into claims, and returns an OpenID4VCI wallet offer URI.

## Run

```sh
pnpm install
cp .env.example .env
AUTHBOUND_API_KEY=sk_test_... pnpm dev
```

Open `http://localhost:3000`, click **Create wallet offer**, then encode the returned `offerUri` as a QR code or open it with a compatible wallet.

## What It Shows

1. Initialize `AuthboundClient` with a server-side secret key.
2. Create the credential definition if it does not exist.
3. Map business data into credential claims.
4. Call `authbound.openId4Vc.issuance.createOffer`.
5. Return `offer.offerUri` to your website.

Credential definition metadata is published through issuer metadata so wallets can discover the credential configuration. Do not put secrets or personal data in definition titles, claim labels, aliases, rendering, or metadata.
