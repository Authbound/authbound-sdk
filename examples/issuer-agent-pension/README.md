# Issuer Agent Pension Demo

Minimal server-side example for the issuer-agent flow:

1. Ensure a pension credential definition exists for the API-key project.
2. Load business JSON from `pension-record.json`.
3. Map the JSON to credential claims.
4. Create an OpenID4VCI offer with `authbound.openId4Vc.issuance.createOffer`.
5. Return the `offerUri` for wallet handoff.

```sh
AUTHBOUND_API_KEY=sk_test_... pnpm tsx server.ts
```

Open `http://localhost:3000/offer` to create and return a wallet offer URI.
