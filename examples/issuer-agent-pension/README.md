# Pension Credential Example

A small Node demo that mirrors the [FindyFi Paradym](https://github.com/FindyFi/pensioncredential-paradym) and [Procivis](https://github.com/FindyFi/pensioncredential-procivis) pension demos: pick a demo identity (KAEL / TKEL / KUKI), issue a credential to an EU wallet, or verify a pension credential with Authbound.

## How it maps to Paradym / Procivis

| Paradym / Procivis fixture | This example slug | `Pension.typeCode` |
| --- | --- | --- |
| `pensioncredential.json` | `kael` | KAEL |
| `pensioncredential-provisional.json` | `tkel-provisional` | TKEL (provisional) |
| `pensioncredential-disability.json` | `tkel-disability` | TKEL |
| `pensioncredential-rehabilitation.json` | `kuki` | KUKI |
| `pensioncredential-rehabilitation-expired.json` | `kuki-expired` | KUKI (ended) |

All five options use **one** Authbound credential definition (`pension-credential`, VCT `urn:vc:authbound:pension:1.0`). The slug only changes the claim values passed to `createOffer`, same as Paradym’s single template with different attributes.

## Start

From `packages/public-sdk`:

```sh
cd examples/issuer-agent-pension
cp .env.example .env.local
```

Set `AUTHBOUND_SECRET_KEY` and `AUTHBOUND_PUBLISHABLE_KEY` in `.env.local`, then:

```sh
pnpm dev
```

On Windows, `pnpm dev` builds only the SDK entry points this example needs. If you need the full `@authbound/server` package build (all framework adapters), run `pnpm --filter @authbound/server build` from `packages/public-sdk` separately.

Open `http://127.0.0.1:3333`.

## Files

| File | Role |
| --- | --- |
| `credential-catalog.ts` | Five demo claim presets (Paradym-aligned) |
| `pension-flow.ts` | SDK: definition, issuance offer, verification |
| `demo-page.ts` | Demo UI (Kela navbar, verify success state) |
| `server.ts` | HTTP routes + static assets |
| `utils.ts` | HTML escaping, verification session cache |
| `public/kela-logo.svg` | Kela wordmark (links to kela.fi) |
| `public/authbound-wordmark.svg` | Authbound logo in footer |

## Routes

- `GET /` — demo page (identity selector, issue + verify tabs)
- `GET /credentials` — list slugs and labels
- `POST /offer` — body `{ "slug": "kael" }` → wallet offer + QR data
- `POST /verify` — create pension verification + QR
- `GET /status?id=...` — poll verification status (uses in-memory client token)
- `GET /result?id=...` — signed result after `verified`

## Configuration

See `.env.example`. Verification status polling requires `AUTHBOUND_PUBLISHABLE_KEY` (or `NEXT_PUBLIC_AUTHBOUND_PK`).

Verification uses policy `pol_authbound_pension_v1` with provider `eudi`, matching the monorepo pension demo.
