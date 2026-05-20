# Pension Credential Example

A small Node example that issues a pension credential offer and verifies the
same credential type with Authbound.

The example keeps the SDK flow in `pension-flow.ts`, small parsing/HTML helpers
in `utils.ts`, and the demo web server in `server.ts`.

## Start

From the repository root:

```sh
cd examples/issuer-agent-pension
```

Create `.env.local` from the example file:

```sh
cp .env.example .env.local
```

Then edit `.env.local` and set your `AUTHBOUND_SECRET_KEY` and
`AUTHBOUND_PUBLISHABLE_KEY`.

Start the app:

```sh
pnpm dev
```

Open:

```sh
http://127.0.0.1:3333
```

For phone testing, open the same port on your computer's LAN IP, for example:

```sh
http://192.168.50.143:3333
```

## What The Example Shows

`pension-flow.ts` contains the SDK calls you would copy into your own backend:

- `createPensionCredentialDefinition` creates or reuses the credential
  definition.
- `createPensionCredentialOffer` creates an OpenID4VCI wallet offer from one
  JSON-LD pension credential fixture.
- `createPensionVerificationRequest` creates an EUDI verification request for
  the pension policy.
- `getPensionVerificationStatus` polls verification status with the client
  token.
- `getPensionVerificationResult` fetches the signed verification result after
  verification succeeds.

`server.ts` adds the local demo UI, QR rendering, and short-lived in-memory
session storage for client tokens.

## Routes

- `GET /` renders the credential selector and issuer/verifier UI.
- `GET /credentials` returns the sample JSON-LD credentials.
- `POST /offer` accepts `{ "slug": "rehabilitation-subsidy" }` and returns a
  wallet offer plus QR SVG.
- `POST /verify` creates a verification request plus QR SVG.
- `GET /status?id=...` returns the latest verification status.
- `GET /result?id=...` returns the signed verification result after the status
  reaches `verified`.

## Configuration

`.env.example` lists the credentials this example needs:
`AUTHBOUND_SECRET_KEY` and `AUTHBOUND_PUBLISHABLE_KEY`.
