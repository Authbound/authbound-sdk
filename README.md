# Authbound Public SDK

TypeScript SDK packages for Authbound verification and OpenID4VC credential issuance.

## Install

```sh
pnpm add @authbound-sdk/server
```

## Initialize

```ts
import { AuthboundClient } from "@authbound-sdk/server";

const authbound = new AuthboundClient({
  apiKey: process.env.AUTHBOUND_API_KEY!,
});
```

Use a server-side secret key: `sk_test_*` for test mode or `sk_live_*` for live mode. Do not expose this key in browser code.

## Run The Basic Issuer Example

The smallest runnable issuer-agent example lives in [`examples/issuer-agent-basic`](./examples/issuer-agent-basic).

```sh
cd examples/issuer-agent-basic
pnpm install
cp .env.example .env
AUTHBOUND_API_KEY=sk_test_... pnpm dev
```

Open `http://localhost:3000`, click **Create wallet offer**, and the server will:

1. Create an `Employee Badge` credential definition if it does not exist.
2. Map a sample employee record into credential claims.
3. Call `authbound.openId4Vc.issuance.createOffer`.
4. Return the `offerUri` for QR-code or wallet-link handoff.

## Issue A Credential Offer

Credential definitions are Authbound's issuer templates. List them first, create an OpenID4VCI offer, render the returned `offerUri` as a QR code, then poll the issuance session until the wallet redeems it.

```ts
const definitions = await authbound.issuer.credentialDefinitions.list();

const pensionDefinition = definitions.data.find(
  (definition) => definition.credentialDefinitionId === "pension_credential_v1"
);

if (!pensionDefinition) {
  throw new Error("Credential definition is not available for this project");
}

const offer = await authbound.openId4Vc.issuance.createOffer({
  credentialDefinitionId: pensionDefinition.credentialDefinitionId,
  claims: {
    Person: {
      given_name: "Sergio",
      family_name: "Jack",
    },
    Pension: {
      startDate: "2025-01-01",
    },
  },
  issuanceMode: "InTime",
  txCode: "1234",
  idempotencyKey: crypto.randomUUID(),
});

// Encode this URI as a QR code or pass it to your wallet handoff UI.
console.log(offer.offerUri);

const latest = await authbound.openId4Vc.issuance.get(offer.id);
console.log(latest.status);
```

## Add Issuance to an Existing Application

Use this shape when adding issuance to an existing website:

1. Create or update a project-scoped credential definition during setup.
2. Map your business JSON into credential claims.
3. Call `openId4Vc.issuance.createOffer`.
4. Return `offer.offerUri` to the browser and render it as a QR code or wallet link.
5. Poll `openId4Vc.issuance.get` until the session reaches a terminal status.

```ts
const definition = await authbound.issuer.credentialDefinitions.create({
  credentialDefinitionId: "pension_credential_v1",
  vct: "urn:vc:authbound:pension:1.0",
  format: "dc+sd-jwt",
  title: "Pension Credential",
  aliases: ["pension"],
  claims: [
    { path: ["Person", "given_name"], mandatory: true, displayName: "Given Name" },
    { path: ["Person", "family_name"], mandatory: true, displayName: "Family Name" },
    { path: ["Pension", "startDate"], mandatory: true, displayName: "Start Date" },
  ],
  metadata: {
    source: "issuer-agent-demo",
  },
});

const pensionRecord = {
  person: {
    givenName: "Sergio",
    familyName: "Jack",
  },
  pension: {
    startDate: "2025-01-01",
  },
};

const claims = {
  Person: {
    given_name: pensionRecord.person.givenName,
    family_name: pensionRecord.person.familyName,
  },
  Pension: {
    startDate: pensionRecord.pension.startDate,
  },
};

const offer = await authbound.openId4Vc.issuance.createOffer({
  credentialDefinitionId: definition.credentialDefinitionId,
  claims,
  issuanceMode: "InTime",
  metadata: {
    userRef: "user_123",
    recordRef: "pension_record_456",
  },
  idempotencyKey: `pension_record_456:${definition.credentialDefinitionId}`,
});

return offer.offerUri;
```

Credential definition metadata is public issuer metadata for wallet discovery. Keep secrets and personal data in issuance `claims` or private application storage, not in definition titles, aliases, labels, rendering, or metadata.

You can also create an offer by `vct` when you want the issuer to resolve the configured definition:

```ts
await authbound.openId4Vc.issuance.createOffer({
  vct: "urn:vc:authbound:pension:1.0",
  claims: {
    Pension: {
      startDate: "2025-01-01",
    },
  },
});
```

## Manage Credential Definitions

Project definitions are scoped to the API key's project and environment. Global Authbound definitions can be listed and used, while customer-created definitions can be updated or archived.

```ts
await authbound.issuer.credentialDefinitions.update("pension_credential_v1", {
  title: "Updated Pension Credential",
  aliases: ["pension", "retirement-benefit"],
});

await authbound.issuer.credentialDefinitions.archive("pension_credential_v1");
```

## Deferred Issuance

For deferred flows, create the offer first and patch claims before the wallet token is issued.

```ts
const offer = await authbound.openId4Vc.issuance.createOffer({
  credentialDefinitionId: "pension_credential_v1",
  claims: {},
  issuanceMode: "Deferred",
});

await authbound.openId4Vc.issuance.update(offer.id, {
  claims: {
    Pension: {
      startDate: "2025-02-01",
    },
  },
});
```

## Manage Issuance Offers

```ts
const offers = await authbound.openId4Vc.issuance.list({ limit: 25 });
const offer = await authbound.openId4Vc.issuance.get(offers.data[0]!.id);

if (offer.status === "offer_created") {
  await authbound.openId4Vc.issuance.cancel(offer.id);
}
```

## Verifications

Create verifications through `authbound.verifications`. Public metadata is returned for reconciliation; do not put secrets or unnecessary PII in metadata.

```ts
const verification = await authbound.verifications.create({
  policyId: "pol_authbound_pension_v1",
  customerUserRef: "user_123",
  metadata: { demo: "pension" },
  provider: "eudi",
  idempotencyKey: "verify_user_123",
});

const status = await authbound.verifications.getStatus(verification.id, {
  clientToken: verification.clientToken!,
  publishableKey: process.env.AUTHBOUND_PUBLISHABLE_KEY!,
  origin: "https://app.example.com",
});

console.log(status.status);
```

## Development

```sh
pnpm --filter @authbound-sdk/server test
pnpm --filter @authbound-sdk/server typecheck
pnpm --filter @authbound-sdk/server build
```

## Contributing and Publishing

See [CONTRIBUTING](./CONTRIBUTING.md) for contribution workflow and release standards.

### Publishable packages

- `@authbound-sdk/core`
- `@authbound-sdk/server`
- `@authbound-sdk/shared`
- `@authbound-sdk/react`
- `@authbound-sdk/vue`
- `@authbound-sdk/nextjs`
- `@authbound-sdk/nuxt`
