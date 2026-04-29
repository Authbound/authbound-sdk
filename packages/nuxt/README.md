# @authbound/nuxt

Nuxt 3 module for Authbound verification flows with runtime components, composables, and server routes.

```sh
pnpm add @authbound/nuxt
```

```ts
export default defineNuxtConfig({
  modules: ["@authbound/nuxt"],
  authbound: {
    policyId: "pol_...",
  },
});
```

Use `@authbound/vue` directly only when you are building a non-Nuxt Vue app.
