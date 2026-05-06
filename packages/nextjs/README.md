# @authbound/nextjs

Next.js integration for Authbound verification flows, including middleware helpers, server routes, and client components.

```sh
pnpm add @authbound/nextjs
```

```ts
import { withAuthbound } from "@authbound/nextjs";
import { VerificationWall } from "@authbound/nextjs/client";
import { createAuthboundHandlers } from "@authbound/nextjs/server";
```

Use this package when your app is built on Next.js. For framework-neutral server code, use `@authbound/server`.

## Quick Start

Create one catch-all route:

```ts
// app/api/authbound/[...authbound]/route.ts
import { createAuthboundHandlers } from "@authbound/nextjs/server";

export const { GET, POST, DELETE } = createAuthboundHandlers({
  apiKey: process.env.AUTHBOUND_SECRET_KEY!,
  publishableKey: process.env.NEXT_PUBLIC_AUTHBOUND_PK!,
  secret: process.env.AUTHBOUND_SESSION_SECRET!,
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
    >
      <VerificationWall />
    </AuthboundProvider>
  );
}
```

The browser creates a verification, subscribes to status, then calls
`POST /api/authbound/session` after `verified`. Webhooks are for backend
reconciliation and require `AUTHBOUND_WEBHOOK_SECRET` by default.
