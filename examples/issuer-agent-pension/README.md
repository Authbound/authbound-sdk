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

Set the verification keys (`AUTHBOUND_SECRET_KEY`, `AUTHBOUND_PUBLISHABLE_KEY`) and issuance settings (`AUTHBOUND_ISSUANCE_SECRET_KEY`, `AUTHBOUND_ISSUANCE_API_URL`) in `.env.local`, then:

```sh
pnpm dev
```

Open `http://127.0.0.1:3333`.

For phone testing, open the same port on your computer's LAN IP, for example `http://192.168.50.143:3333`.

## What The Example Shows

`pension-flow.ts` contains the SDK calls you would copy into your own backend:

- `createPensionCredentialDefinition` reuses the known published pension definition, publishes only this demo's known complete draft, or creates it only when Authbound returns the typed credential-definition not-found error.
- `createPensionCredentialOffer` creates an OpenID4VCI wallet offer from a JSON pension credential fixture.
- `createPensionVerificationRequest` creates an EUDI verification request for the pension policy.
- `getPensionVerificationStatus` polls verification status with the client token.
- `getPensionVerificationResult` fetches the signed verification result after verification succeeds.

`server.ts` adds the local demo UI, QR rendering, and short-lived in-memory session storage for client tokens. Result fetching is bound to that in-memory session so the server secret key is not exposed as a generic result lookup endpoint.

## Copying This Into Your Service

For issuance, copy the shape of `createPensionCredentialOffer`: choose a credential definition, map your own database record into the `claims` object, call `authbound.openId4Vc.issuance.createOffer`, then show `offer.offerUri` as a QR code or wallet link.

For verification, configure a policy in Authbound first, then call `authbound.verifications.create` with that policy ID. Status polling uses the returned `clientToken` plus the publishable key; this SDK call does not send the secret API key. This demo stores the `clientToken` server-side, then fetches the signed result from the server only after the verification reaches `verified`.

The JSON fixtures, credential selector, QR rendering, and in-memory `Map` session store are demo-only. A production service would load credential data from its own database, keep policy and credential definition IDs in configuration, and store verification sessions in durable server-side storage.

This example owns the exact complete `pension-credential` definition. Its recovery helper can publish that known draft with `publish:pension-credential:v1`; it never lists drafts or bulk-publishes discovered definitions. An archived definition is not reusable: create a new credential-definition ID and VCT version.

`authbound.issuer.credentialDefinitions.create()` creates and returns a published definition. For intentional staging, call `authbound.issuer.credentialDefinitions.createDraft()` and inspect the owned draft before calling `authbound.issuer.credentialDefinitions.publish()`. Published definitions are immutable, so every change requires a new credential-definition ID and VCT version.

`metadata` is authenticated management metadata, not wallet-discoverable issuer or credential metadata. `rendering` supports only six-digit colors and Authbound-owned presets; it does not accept arbitrary SVG, HTML, CSS, or customer templates.

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

### Separate issuance and verification

`POST /offer`, including credential-definition lookup and publication, uses only
`AUTHBOUND_ISSUANCE_SECRET_KEY` and `AUTHBOUND_ISSUANCE_API_URL`. Both are required;
missing issuance configuration fails rather than using the verification credentials.
Existing deployments must set these two variables before updating this example.

`POST /verify`, `GET /status`, and `GET /result` retain `AUTHBOUND_SECRET_KEY`,
`AUTHBOUND_API_URL`, and `AUTHBOUND_PUBLISHABLE_KEY`. For an isolated test
environment, set each API URL to the corresponding deployment and use keys
provisioned for that environment. Obtain deployment URLs from your operator.
The issuance key needs issuer read/write access;
the verification key needs verification read/write access. Keep keys in the
server's environment or `.env.local`, never in browser code or committed files.

### SDK and API versions

Run this example with its workspace SDK dependencies. This checkout uses server
SDK 0.3.0 and API contract revision `v1.2026-08-26.1`, including credential-definition
lifecycle operations. Do not substitute SDK 0.2.2 into this source: older responses
can omit lifecycle status. A missing status indicates incompatible versions, not
an archived definition. Use an API deployment supporting the workspace contract;
this example does not bypass lifecycle validation.

### Findy Wallet Tester

The Python tester's existing Authbound provider calls this demo's `POST /offer`
and `POST /verify`. Configure its Authbound `base_url` with the reachable **demo
URL**, not the raw Gateway URL. The tester does not use the JavaScript SDK or need
the demo's API keys. The demo uses the SDK and server-side keys to obtain the
wallet links consumed by the tester.

Updating this repository does not update a hosted demo automatically. Its operator
must deploy the updated source and configure the keys and API URLs. The routes
remain compatible with the tester; the source and version of a separately hosted
Findynet instance must be confirmed with its operator.
