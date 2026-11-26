/**
 * Authbound Nuxt Plugin
 *
 * Initializes the Authbound client on the client side.
 */

import {
  type AuthboundClient,
  asPublishableKey,
  createClient,
  isPublishableKey,
  type PolicyId,
} from "@authbound/core";
import { AuthboundPlugin, type AuthboundPluginOptions } from "@authbound/vue";
import { defineNuxtPlugin, useRuntimeConfig } from "nuxt/app";

export default defineNuxtPlugin({
  name: "authbound",
  setup(nuxtApp) {
    const config = useRuntimeConfig();

    const rawPublishableKey = config.public.authbound?.publishableKey ?? "";

    if (!rawPublishableKey) {
      console.warn(
        "[Authbound] Missing publishable key. Set NUXT_PUBLIC_AUTHBOUND_PK in your environment."
      );
    }

    const apiUrl = config.public.authbound?.apiUrl ?? "";
    if (!apiUrl) {
      console.warn(
        "[Authbound] Missing API URL. Set AUTHBOUND_API_URL (or apiUrl in the authbound module options) to the Authbound API host your keys belong to."
      );
    }

    // Create client instance
    let client: AuthboundClient | null = null;

    if (apiUrl && rawPublishableKey && isPublishableKey(rawPublishableKey)) {
      try {
        const pluginOptions: AuthboundPluginOptions = {
          publishableKey: asPublishableKey(rawPublishableKey),
          policyId: config.public.authbound?.policyId as PolicyId | undefined,
          gatewayUrl: apiUrl,
          verificationEndpoint:
            config.public.authbound?.verificationEndpoint ??
            "/api/authbound/verification",
          sessionEndpoint:
            config.public.authbound?.sessionEndpoint ??
            "/api/authbound/session",
          sessionMode: config.public.authbound?.sessionMode ?? "sdk",
          debug: config.public.authbound?.debug,
        };
        client = createClient(pluginOptions);
        AuthboundPlugin.install(nuxtApp.vueApp, pluginOptions);
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
