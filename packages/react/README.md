# @authbound/react

React components, hooks, and test utilities for Authbound verification flows.

```sh
pnpm add @authbound/react
```

```tsx
import { AuthboundProvider, VerificationWall, useVerification } from "@authbound/react";

export function App() {
  return (
    <AuthboundProvider publishableKey="pk_...">
      <VerificationWall policyId="pol_..." />
    </AuthboundProvider>
  );
}
```

For Next.js applications, prefer `@authbound/nextjs`.
