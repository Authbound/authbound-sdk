/**
 * Authbound Nuxt Plugin
 *
 * Initializes the Authbound client on the client side.
 */

import { type AuthboundClient, createClient } from "@authbound/core";
import { defineNuxtPlugin, useRuntimeConfig } from "#app";

export default defineNuxtPlugin({
  name: "authbound",
  setup() {
    const config = useRuntimeConfig();

    // Get publishable key from environment
    const publishableKey =
      (import.meta.env.NUXT_PUBLIC_AUTHBOUND_PK as string) ||
      (import.meta.env.VITE_AUTHBOUND_PK as string) ||
      "";

    if (!publishableKey) {
      console.warn(
        "[Authbound] Missing publishable key. Set NUXT_PUBLIC_AUTHBOUND_PK in your environment."
      );
    }

    // Create client instance
    let client: AuthboundClient | null = null;

    if (publishableKey) {
      try {
        client = createClient({
          publishableKey: publishableKey as any,
          policyId: config.public.authbound?.policyId,
          debug: config.public.authbound?.debug,
        });
      } catch (error) {
        console.error("[Authbound] Failed to create client:", error);
      }
    }

    return {
      provide: {
        authbound: {
          client,
          config: config.public.authbound,
        },
      },
    };
  },
});
