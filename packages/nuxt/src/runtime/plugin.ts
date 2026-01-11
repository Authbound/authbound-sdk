/**
 * Authbound Nuxt Plugin
 *
 * Initializes the Authbound client on the client side.
 */

import {
  type AuthboundClient,
  createClient,
  isPublishableKey,
  asPublishableKey,
  type PolicyId,
} from "@authbound-sdk/core";
import { defineNuxtPlugin, useRuntimeConfig } from "#app";

export default defineNuxtPlugin({
  name: "authbound",
  setup() {
    const config = useRuntimeConfig();

    // Get publishable key from environment
    const rawPublishableKey =
      (import.meta.env.NUXT_PUBLIC_AUTHBOUND_PK as string) ||
      (import.meta.env.VITE_AUTHBOUND_PK as string) ||
      "";

    if (!rawPublishableKey) {
      console.warn(
        "[Authbound] Missing publishable key. Set NUXT_PUBLIC_AUTHBOUND_PK in your environment."
      );
    }

    // Create client instance
    let client: AuthboundClient | null = null;

    if (rawPublishableKey && isPublishableKey(rawPublishableKey)) {
      try {
        client = createClient({
          publishableKey: asPublishableKey(rawPublishableKey),
          policyId: config.public.authbound?.policyId as PolicyId | undefined,
          debug: config.public.authbound?.debug,
        });
      } catch (error) {
        console.error("[Authbound] Failed to create client:", error);
      }
    } else if (rawPublishableKey) {
      console.error(
        "[Authbound] Invalid publishable key format. Expected pk_live_... or pk_test_..."
      );
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
