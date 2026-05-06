# @authbound/core

Framework-agnostic Authbound SDK primitives for browser verification flows, links, status subscriptions, policies, tokens, and typed errors.

```sh
pnpm add @authbound/core
```

```ts
import { createClient } from "@authbound/core";

const authbound = createClient({
  publishableKey: "pk_...",
});
```

Most applications should install a framework package instead, such as `@authbound/nextjs`, `@authbound/react`, `@authbound/vue`, or `@authbound/nuxt`.
