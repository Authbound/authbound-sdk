# @authbound/nuxt

Nuxt 4 module for Authbound verification flows with runtime components, composables, and server routes.

```sh
pnpm add @authbound/nuxt
```

```ts
export default defineNuxtConfig({
  modules: ["@authbound/nuxt"],
  authbound: {
    policyId: "pol_...",
    publishableKey: process.env.NUXT_PUBLIC_AUTHBOUND_PK,
    apiKey: process.env.AUTHBOUND_SECRET_KEY,
    sessionSecret: process.env.AUTHBOUND_SESSION_SECRET,
  },
});
```

The module exposes the SDK verification and session routes under
`/api/authbound`. After the browser observes a verified status, the session route
validates the pending same-origin binding and fetches the signed result with your
secret key before setting the SDK cookie.

Use `@authbound/vue` directly only when you are building a non-Nuxt Vue app.
