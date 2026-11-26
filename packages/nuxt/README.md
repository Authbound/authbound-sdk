# @authbound/nuxt

Nuxt 4 module for Authbound verification flows with runtime components, composables, and server routes.

```sh
pnpm add @authbound/nuxt
```

```ts
import { asPolicyId } from "@authbound/nuxt";

export default defineNuxtConfig({
  modules: ["@authbound/nuxt"],
  authbound: {
    policyId: asPolicyId("pol_age_over_18_eudi_v1"),
    publishableKey: process.env.NUXT_PUBLIC_AUTHBOUND_PK,
    apiUrl: process.env.AUTHBOUND_API_URL,
    apiKey: process.env.AUTHBOUND_SECRET_KEY,
    sessionSecret: process.env.AUTHBOUND_SESSION_SECRET,
  },
});
```

Requires Nuxt 4 and Vue 3.5.34 through 3.x.

`apiUrl` is the Authbound API host your keys belong to. The server routes and
the browser SDK both use it, and `NUXT_PUBLIC_AUTHBOUND_API_URL` overrides it at
runtime. There is no default host: a key works only on the host that issued it.
Without one the server routes answer `500` with `data.code: "MISSING_API_URL"`
(`INVALID_API_URL` for a value that is not an absolute http(s) URL), and `502`
with `data.code: "NETWORK_ERROR"` when the host cannot be reached.

The module exposes the SDK verification and session routes under
`/api/authbound`. After the browser observes a verified status, the session route
validates the pending same-origin binding and fetches the signed result with your
secret key before setting the SDK cookie.

SDK-managed sessions require the Web Locks API. Same-origin tabs serialize browser session mutations under a lock keyed by the resolved endpoint origin. For browsers or embedded webviews without `navigator.locks`, or when several origins share a parent-domain cookie, set `sessionMode: "manual"` and coordinate session creation on your server.

Use `@authbound/vue` directly only when you are building a non-Nuxt Vue app.
