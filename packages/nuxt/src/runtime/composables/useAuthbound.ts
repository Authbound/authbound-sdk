/**
 * useAuthbound - Access Authbound context in Nuxt.
 */

import type { AuthboundClient } from "@authbound/core";
import { useNuxtApp, useRuntimeConfig } from "nuxt/app";

export interface AuthboundContext {
  client: AuthboundClient | null;
  config: {
    policyId?: string;
    verifyPath?: string;
    debug?: boolean;
  };
}

declare module "nuxt/app" {
  interface NuxtApp {
    $authbound?: AuthboundContext;
  }
}

/**
 * Access the Authbound context.
 *
 * @example
 * ```vue
 * <script setup>
 * const { client, config } = useAuthbound();
 * </script>
 * ```
 */
export function useAuthbound(): AuthboundContext {
  const nuxtApp = useNuxtApp();
  const runtimeConfig = useRuntimeConfig();

  return {
    client: nuxtApp.$authbound?.client ?? null,
    config: runtimeConfig.public.authbound ?? {},
  };
}
