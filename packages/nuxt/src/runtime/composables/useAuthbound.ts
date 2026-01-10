/**
 * useAuthbound - Access Authbound context in Nuxt.
 */

import type { AuthboundClient } from "@authbound-sdk/core";
import { useNuxtApp, useRuntimeConfig } from "#app";

export interface AuthboundContext {
  client: AuthboundClient | null;
  config: {
    policyId?: string;
    verifyPath?: string;
    debug?: boolean;
  };
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
