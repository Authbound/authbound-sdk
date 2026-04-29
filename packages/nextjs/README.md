# @authbound/nextjs

Next.js integration for Authbound verification flows, including middleware helpers, server routes, and client components.

```sh
pnpm add @authbound/nextjs
```

```ts
import { withAuthbound } from "@authbound/nextjs";
import { VerificationWall } from "@authbound/nextjs/client";
import { createVerificationRoute } from "@authbound/nextjs/server";
```

Use this package when your app is built on Next.js. For framework-neutral server code, use `@authbound/server`.
