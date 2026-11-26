# @authbound/nextjs

Next.js integration for Authbound verification flows, including middleware helpers, server routes, and client components.

```sh
pnpm add @authbound/nextjs
```

```ts
import { withAuthbound } from "@authbound/nextjs/middleware";
import { VerificationWall } from "@authbound/nextjs/client";
import { createAuthboundHandlers } from "@authbound/nextjs/server";
```

Use this package when your app is built on Next.js. For framework-neutral server code, use `@authbound/server`.

Requires Next.js 14 through 16 and React 18.3 through 19.x.

## Quick Start

Set these environment variables. `AUTHBOUND_API_URL` and
`NEXT_PUBLIC_AUTHBOUND_API_URL` both hold the Authbound API host your keys
belong to, one for the server routes and one for the browser. There is no
default host: a key works only on the host that issued it.

```sh
AUTHBOUND_API_URL=https://...
NEXT_PUBLIC_AUTHBOUND_API_URL=https://...
AUTHBOUND_SECRET_KEY=sk_test_...
NEXT_PUBLIC_AUTHBOUND_PK=pk_test_...
AUTHBOUND_SESSION_SECRET=at-least-32-random-characters
AUTHBOUND_WEBHOOK_SECRET=whsec_...
```

Create one catch-all route:

```ts
// app/api/authbound/[...authbound]/route.ts
import { createAuthboundHandlers } from "@authbound/nextjs/server";

export const { GET, POST, DELETE } = createAuthboundHandlers({
  apiKey: process.env.AUTHBOUND_SECRET_KEY!,
  apiUrl: process.env.AUTHBOUND_API_URL!,
  publishableKey: process.env.NEXT_PUBLIC_AUTHBOUND_PK!,
  secret: process.env.AUTHBOUND_SESSION_SECRET!,
  allowedOrigins: [process.env.NEXT_PUBLIC_APP_URL!],
  webhookSecret: process.env.AUTHBOUND_WEBHOOK_SECRET!,
  routes: {
    protected: [{ path: "/dashboard", requirements: { verified: true } }],
    verify: "/verify",
    callback: "/api/authbound/webhook",
  },
});
```

Wrap the verification page:

```tsx
"use client";

import "@authbound/nextjs/styles.css";
import {
  asPolicyId,
  AuthboundProvider,
  VerificationWall,
} from "@authbound/nextjs/client";

export default function VerifyPage() {
  return (
    <AuthboundProvider
      policyId={asPolicyId(process.env.NEXT_PUBLIC_AUTHBOUND_POLICY_ID!)}
      publishableKey={process.env.NEXT_PUBLIC_AUTHBOUND_PK!}
      gatewayUrl={process.env.NEXT_PUBLIC_AUTHBOUND_API_URL!}
    >
      <VerificationWall />
    </AuthboundProvider>
  );
}
```

The browser creates a verification, subscribes to status, then calls
`POST /api/authbound/session` after `verified`. The session route validates the
pending same-origin binding, fetches the signed result with your secret key, and
sets the SDK cookie. Webhooks are for backend reconciliation and require
`AUTHBOUND_WEBHOOK_SECRET` by default.

The single-purpose route factories (`createVerificationRoute`,
`createStatusRoute`, `createSessionRoute` and the station routes) read
`AUTHBOUND_API_URL`, or their `gatewayUrl` option, on each request. Without
one they answer `500` with `code: "MISSING_API_URL"` (`INVALID_API_URL` for a
value that is not an absolute http(s) URL), and `502` with
`code: "NETWORK_ERROR"` when the host cannot be reached.

SDK-managed sessions require the Web Locks API. Same-origin tabs serialize browser session mutations under a lock keyed by the resolved endpoint origin. For browsers or embedded webviews without `navigator.locks`, or when several origins share a parent-domain cookie, set `sessionMode="manual"` and coordinate session creation on your server.

Set `allowedOrigins` to your public app origin when the route runs behind a
proxy or container URL. If you want the SDK to derive the public origin from
`Forwarded` or `X-Forwarded-*` headers instead, set `trustProxy: true` only when
those headers are supplied by infrastructure you control.
