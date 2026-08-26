# @authbound/core

Framework-agnostic Authbound SDK primitives for browser verification flows, links, status subscriptions, policies, tokens, and typed errors.

```sh
pnpm add @authbound/core
```

```ts
import { createClient } from "@authbound/core";

const authbound = createClient({
  publishableKey: "pk_test_...",
});
```

Most applications should install a framework package instead, such as `@authbound/nextjs`, `@authbound/react`, `@authbound/vue`, or `@authbound/nuxt`.

Requires Node.js 18 or newer when used in Node. SDK-managed browser sessions also require the Web Locks API. Same-origin tabs coordinate under a lock keyed by the resolved endpoint origin. If `navigator.locks` is unavailable, use `sessionMode: "manual"` and finalize the session on your server.
