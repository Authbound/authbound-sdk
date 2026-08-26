# Authbound Public SDK

TypeScript SDK packages for Authbound verification and OpenID4VC credential issuance.

## For AI Agents

Authbound publishes AI-friendly docs for Codex, Claude Code, Cursor, GitHub Copilot, Windsurf, Gemini CLI, and other compatible tools.

- AI docs: https://docs.authbound.io/ai/overview
- Machine-readable docs index: https://docs.authbound.io/llms.txt

Agents should use the hosted docs as the source of truth, keep `sk_*` keys server-only, treat publishable keys as browser-safe identifiers only, verify webhooks server-side, and use idempotency keys for verification and issuance mutations.

## Releases

Use [`RELEASE.md`](./RELEASE.md) for SDK versioning, `sdk-v*` tags, release
checks, and manual npm publishing.

## Install

```sh
pnpm add @authbound/server
```

## Initialize

```ts
import { AuthboundClient } from "@authbound/server";

const authbound = new AuthboundClient({
  apiKey: process.env.AUTHBOUND_SECRET_KEY!,
});
```

Use a server-side secret key: `sk_test_*` for test mode or `sk_live_*` for live mode. Do not expose this key in browser code.

## Run The Basic Issuer Example

The smallest runnable issuer-agent example lives in [`examples/issuer-agent-basic`](./examples/issuer-agent-basic).

```sh
cd examples/issuer-agent-basic
pnpm install
cp .env.example .env
AUTHBOUND_SECRET_KEY=sk_test_... pnpm dev
```

Open `http://localhost:3000`, click **Create wallet offer**, and the server will:

1. Reuse an `Employee Badge` published definition, publish only its own known draft, or create the complete definition when it is not found.
2. Map a sample employee record into credential claims.
3. Call `authbound.openId4Vc.issuance.createOffer`.
4. Return the `offerUri` for QR-code or wallet-link handoff.

## Issue A Credential Offer

Credential definitions are Authbound's issuer templates. List them for discovery and inspection, select a published definition, create an OpenID4VCI offer, render the returned `offerUri` as a QR code, then poll the issuance session until the wallet redeems it. Listing drafts does not authorize publishing them.

```ts
const definitions = await authbound.issuer.credentialDefinitions.list();

const pensionDefinition = definitions.data.find(
  (definition) => definition.credentialDefinitionId === "pension_credential_v1"
);

if (!pensionDefinition) {
  throw new Error("Credential definition is not available for this project");
}

if (pensionDefinition.lifecycleStatus !== "published") {
  throw new Error("Credential definition must be published before issuance");
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

1. Create a project-scoped published credential definition during setup, or intentionally stage one with `authbound.issuer.credentialDefinitions.createDraft()` then `authbound.issuer.credentialDefinitions.publish()`.
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

`metadata` is authenticated management metadata, not wallet-discoverable issuer or credential metadata. Keep secrets and personal data in issuance `claims` or private application storage, not in definition titles, aliases, labels, rendering, or metadata. `rendering` supports only six-digit colors and Authbound-owned presets, not arbitrary SVG, HTML, CSS, or customer templates.

`authbound.issuer.credentialDefinitions.create()` creates and returns a published definition. Use `authbound.issuer.credentialDefinitions.createDraft()` followed by `authbound.issuer.credentialDefinitions.publish()` only when you intentionally stage a definition.

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

Project definitions are scoped to the API key's project and environment. Use `authbound.issuer.credentialDefinitions.list({ lifecycleStatus: "draft" })` only to discover and inspect drafts; never bulk-publish the result. A runnable service may publish only a known owned draft whose complete definition it controls.

```ts
const draft = await authbound.issuer.credentialDefinitions.createDraft({
  credentialDefinitionId: "pension_credential_v2",
  vct: "urn:vc:authbound:pension:2.0",
  format: "dc+sd-jwt",
  title: "Pension Credential v2",
  aliases: ["pension"],
  claims: [
    { path: ["Person", "given_name"], mandatory: true, displayName: "Given Name" },
    { path: ["Person", "family_name"], mandatory: true, displayName: "Family Name" },
    { path: ["Pension", "startDate"], mandatory: true, displayName: "Start Date" },
  ],
});

await authbound.issuer.credentialDefinitions.update(draft.credentialDefinitionId, {
  title: "Pension Credential v2",
});

const published = await authbound.issuer.credentialDefinitions.publish(
  draft.credentialDefinitionId,
  { idempotencyKey: "publish:pension_credential_v2:v1" }
);
```

Published definitions are immutable. To change one, create a new credential-definition ID and VCT version; do not update the published definition. Archive a definition only when it should no longer be used:

```ts
await authbound.issuer.credentialDefinitions.archive(
  published.credentialDefinitionId
);
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

## Verification Policies

Create project-scoped verification policies with `authbound.policies`, then use the returned policy ID when creating verifications. Policy creation requires a secret key with `policies:write`; list and get require `policies:read`.

```ts
const policy = await authbound.policies.create({
  name: "Pension eligibility",
  purpose: "Pension benefit enrollment",
  credentialDefinitionId: "pension_credential_v1",
  requestedClaims: ["Pension.startDate", "Pension.provider"],
  returnAttrs: ["Pension.startDate"],
  idempotencyKey: "policy:pension-eligibility:v1",
});

const verification = await authbound.verifications.create({
  policyId: policy.id,
  customerUserRef: "user_123",
  idempotencyKey: "verify_user_123",
});
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
});

console.log(status.status);
```

## Development

```sh
pnpm --filter @authbound/server test
pnpm --filter @authbound/server typecheck
pnpm --filter @authbound/server build
```

## Contributing and Publishing

See [CONTRIBUTING](./CONTRIBUTING.md) for contribution workflow and release standards.

### Publishable packages

- `@authbound/core`
- `@authbound/server`
- `@authbound/react`
- `@authbound/vue`
- `@authbound/nextjs`
- `@authbound/nuxt`
