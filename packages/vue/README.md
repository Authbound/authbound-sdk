# @authbound/vue

Vue plugin, composables, components, and styles for Authbound verification flows.

```sh
pnpm add @authbound/vue
```

```ts
import { asPolicyId, AuthboundPlugin } from "@authbound/vue";
import "@authbound/vue/styles.css";
import { createApp } from "vue";
import App from "./App.vue";

createApp(App)
  .use(AuthboundPlugin, {
    publishableKey: "pk_test_...",
    gatewayUrl: "https://...", // the Authbound API host your keys belong to
    policyId: asPolicyId("pol_age_over_18_eudi_v1"),
  })
  .mount("#app");
```

`gatewayUrl` is required and has no default, because a key works only on the host that issued it. Use the same value as `AUTHBOUND_API_URL` on your server.

Requires Vue 3.5.34 through 3.x. Mount the standard `@authbound/server` router on the same origin so `/api/authbound/verification` and `/api/authbound/session` are available.

The default `sessionMode: "sdk"` requires the Web Locks API. Same-origin tabs serialize browser session mutations under a lock keyed by the resolved endpoint origin. For browsers or embedded webviews without `navigator.locks`, or when several origins share a parent-domain cookie, use `sessionMode: "manual"` and coordinate session creation on your server.

For Nuxt applications, prefer `@authbound/nuxt`.
