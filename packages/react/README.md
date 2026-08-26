# @authbound/react

React components, hooks, and test utilities for Authbound verification flows.

```sh
pnpm add @authbound/react
```

```tsx
import "@authbound/react/styles.css";
import {
  asPolicyId,
  AuthboundProvider,
  VerificationWall,
} from "@authbound/react";

const policyId = asPolicyId("pol_age_over_18_authbound_v1");

export function App() {
  return (
    <AuthboundProvider publishableKey="pk_test_...">
      <VerificationWall policyId={policyId} />
    </AuthboundProvider>
  );
}
```

Requires React and React DOM 18.3 through 19.x. Mount the standard `@authbound/server` router on the same origin so `/api/authbound/verification` and `/api/authbound/session` are available.

The default `sessionMode="sdk"` requires the Web Locks API. Same-origin tabs serialize browser session mutations under a lock keyed by the resolved endpoint origin. For browsers or embedded webviews without `navigator.locks`, or when several origins share a parent-domain cookie, use `sessionMode="manual"` and coordinate session creation on your server.

For Next.js applications, prefer `@authbound/nextjs`.
