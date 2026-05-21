# Pension Credential Example

A small Node example that issues and verifies pension credential fixtures using Authbound. KAEL, TKEL, and KUKI pension type codes are stored directly in `credentials/*.json`.

## Fixture Mapping

| Credential fixture | This example slug | `Pension.typeCode` |
| --- | --- | --- |
| `pensioncredential.json` | `kael` | KAEL |
| `pensioncredential-provisional.json` | `tkel-provisional` | TKEL (provisional) |
| `pensioncredential-disability.json` | `tkel-disability` | TKEL |
| `pensioncredential-rehabilitation.json` | `kuki` | KUKI |
| `pensioncredential-rehabilitation-expired.json` | `kuki-expired` | KUKI (ended) |

All options use one Authbound credential definition: `pension-credential`, VCT `urn:vc:authbound:pension:1.0`. The selected slug only chooses which JSON fixture is issued.

## Start

From the repository root:

```sh
cd examples/issuer-agent-pension
cp .env.example .env.local
```

Set `AUTHBOUND_SECRET_KEY` and `AUTHBOUND_PUBLISHABLE_KEY` in `.env.local`, then:

```sh
pnpm dev
```

Open `http://127.0.0.1:3333`.

For phone testing, open the same port on your computer's LAN IP, for example `http://192.168.50.143:3333`.

## What The Example Shows

`pension-flow.ts` contains the SDK calls you would copy into your own backend:

- `createPensionCredentialDefinition` creates or reuses the credential definition for this demo.
- `createPensionCredentialOffer` creates an OpenID4VCI wallet offer from a JSON pension credential fixture.
- `createPensionVerificationRequest` creates an EUDI verification request for the pension policy.
- `getPensionVerificationStatus` polls verification status with the client token.
- `getPensionVerificationResult` fetches the signed verification result after verification succeeds.

`server.ts` adds the local demo UI, QR rendering, and short-lived in-memory session storage for client tokens. Result fetching is bound to that in-memory session so the server secret key is not exposed as a generic result lookup endpoint.

## Copying This Into Your Service

For issuance, copy the shape of `createPensionCredentialOffer`: choose a credential definition, map your own database record into the `claims` object, call `authbound.openId4Vc.issuance.createOffer`, then show `offer.offerUri` as a QR code or wallet link.

For verification, configure a policy in Authbound first, then call `authbound.verifications.create` with that policy ID. Status polling uses the returned `clientToken` plus the publishable key; this SDK call does not send the secret API key. This demo stores the `clientToken` server-side, then fetches the signed result from the server only after the verification reaches `verified`.

The JSON fixtures, credential selector, QR rendering, and in-memory `Map` session store are demo-only. A production service would load credential data from its own database, keep policy and credential definition IDs in configuration, and store verification sessions in durable server-side storage.

## Routes

- `GET /` renders the credential selector and issuer/verifier UI.
- `GET /credentials` returns the sample JSON-LD credentials.
- `POST /offer` accepts `{ "slug": "kael" }` and returns a wallet offer plus QR SVG.
- `POST /verify` creates a verification request plus QR SVG.
- `GET /status?id=...` returns the latest verification status.
- `GET /result?id=...` returns the signed verification result after the status reaches `verified`.

## Configuration

See `.env.example`. Verification status polling requires `AUTHBOUND_PUBLISHABLE_KEY`.

Verification uses policy `pol_authbound_pension_v1` with provider `eudi`.
