/**
 * @authbound/nuxt
 *
 * Nuxt 3 module for Authbound EUDI wallet verification.
 *
 * @example
 * ```ts
 * // nuxt.config.ts
 * export default defineNuxtConfig({
 *   modules: ['@authbound/nuxt'],
 *   authbound: {
 *     publicRoutes: ['/', '/about'],
 *     policyId: 'YOUR_POLICY_ID',
 *   },
 * });
 * ```
 */

import type { PolicyId, PublishableKey } from "@authbound/core";
import {
  addComponent,
  addImports,
  addPlugin,
  addServerHandler,
  createResolver,
  defineNuxtModule,
} from "@nuxt/kit";

export { asPolicyId } from "@authbound/core";

// ============================================================================
// Module Options
// ============================================================================

export interface ModuleOptions {
  /**
   * Routes that don't require verification.
   * Supports exact paths and wildcards.
   * @default []
   */
  publicRoutes?: string[];

  /**
   * Routes that require verification.
   * If not specified, all non-public routes require verification.
   */
  protectedRoutes?: string[];

  /**
   * Default policy ID for verification.
   */
  policyId?: PolicyId | string;

  /**
   * Publishable key exposed to the browser SDK.
   */
  publishableKey?: PublishableKey | string;

  /**
   * Verification creation endpoint used by the browser SDK.
   * @default '/api/authbound/verification'
   */
  verificationEndpoint?: string;

  /**
   * Browser session finalization endpoint used by the browser SDK.
   * @default '/api/authbound/session'
   */
  sessionEndpoint?: string;

  /**
   * Whether the SDK should create its own browser verification session.
   * @default 'sdk'
   */
  sessionMode?: "sdk" | "manual";

  /**
   * Authbound secret key used by server routes.
   */
  apiKey?: string;

  /**
   * Application secret used to verify local session cookies.
   */
  sessionSecret?: string;

  /**
   * Provider to use for verification creation.
   */
  provider?: "auto" | "vcs" | "eudi";

  /**
   * Path to redirect for verification.
   * @default '/verify'
   */
  verifyPath?: string;

  /**
   * Cookie name for session storage.
   * @default '__authbound'
   */
  cookieName?: string;

  /**
   * Webhook signing secret.
   */
  webhookSecret?: string;

  /**
   * Webhook timestamp tolerance in seconds.
   * @default 300
   */
  webhookTolerance?: number;

  /**
   * Explicit test/demo escape hatch for unsigned webhooks. Never use in production.
   * @default false
   */
  unsafeSkipWebhookSignatureVerification?: boolean;

  /**
   * Enable server middleware for route protection.
   * @default true
   */
  middleware?: boolean;

  /**
   * Enable debug logging.
   * @default false
   */
  debug?: boolean;
}

declare module "@nuxt/schema" {
  interface NuxtConfig {
    authbound?: ModuleOptions;
  }

  interface NuxtOptions {
    authbound?: ModuleOptions;
  }
}

// ============================================================================
// Module Definition
// ============================================================================

export default defineNuxtModule<ModuleOptions>({
  meta: {
    name: "@authbound/nuxt",
    configKey: "authbound",
    compatibility: {
      nuxt: "^3.0.0",
    },
  },
  defaults: {
    publicRoutes: [],
    protectedRoutes: undefined,
    policyId: undefined,
    publishableKey: undefined,
    verificationEndpoint: "/api/authbound/verification",
    sessionEndpoint: "/api/authbound/session",
    sessionMode: "sdk",
    apiKey: undefined,
    sessionSecret: undefined,
    provider: undefined,
    verifyPath: "/verify",
    cookieName: "__authbound",
    webhookSecret: undefined,
    webhookTolerance: 300,
    unsafeSkipWebhookSignatureVerification: false,
    middleware: true,
    debug: false,
  },
  setup(options, nuxt) {
    const resolver = createResolver(import.meta.url);

    // Provide options to runtime
    nuxt.options.runtimeConfig.public.authbound = {
      policyId: options.policyId,
      publishableKey:
        options.publishableKey ??
        process.env.NUXT_PUBLIC_AUTHBOUND_PK ??
        process.env.VITE_AUTHBOUND_PK,
      verifyPath: options.verifyPath,
      verificationEndpoint: options.verificationEndpoint,
      sessionEndpoint: options.sessionEndpoint,
      sessionMode: options.sessionMode,
      debug: options.debug,
    };

    nuxt.options.runtimeConfig.authbound = {
      policyId: options.policyId,
      provider: options.provider,
      apiKey: options.apiKey ?? process.env.AUTHBOUND_SECRET_KEY,
      sessionSecret:
        options.sessionSecret ?? process.env.AUTHBOUND_SESSION_SECRET,
      webhookSecret:
        options.webhookSecret ?? process.env.AUTHBOUND_WEBHOOK_SECRET,
      webhookTolerance: options.webhookTolerance,
      publicRoutes: options.publicRoutes,
      protectedRoutes: options.protectedRoutes,
      cookieName: options.cookieName,
      middleware: options.middleware,
      unsafeSkipWebhookSignatureVerification:
        options.unsafeSkipWebhookSignatureVerification,
    };

    // Add plugin for client-side setup
    addPlugin({
      src: resolver.resolve("./runtime/plugin"),
      mode: "client",
    });

    // Auto-import composables
    addImports([
      {
        name: "useVerification",
        from: resolver.resolve("./runtime/composables/useVerification"),
      },
      {
        name: "useAuthbound",
        from: resolver.resolve("./runtime/composables/useAuthbound"),
      },
    ]);

    // Auto-import components
    addComponent({
      name: "AuthboundQRCode",
      filePath: resolver.resolve("./runtime/components/QRCode"),
      export: "QRCode",
    });

    addComponent({
      name: "AuthboundVerificationStatus",
      filePath: resolver.resolve("./runtime/components/VerificationStatus"),
      export: "VerificationStatus",
    });

    addComponent({
      name: "AuthboundStatusBadge",
      filePath: resolver.resolve("./runtime/components/VerificationStatus"),
      export: "StatusBadge",
    });

    addComponent({
      name: "AuthboundVerificationWall",
      filePath: resolver.resolve("./runtime/components/VerificationWall"),
      export: "VerificationWall",
    });

    // Add server middleware for route protection
    if (options.middleware) {
      addServerHandler({
        handler: resolver.resolve("./runtime/server/middleware"),
        middleware: true,
      });
    }

    // Add server API routes
    addServerHandler({
      route: "/api/authbound/verification",
      method: "post",
      handler: resolver.resolve("./runtime/server/api/verification"),
    });

    addServerHandler({
      route: "/api/authbound/webhook",
      method: "post",
      handler: resolver.resolve("./runtime/server/api/webhook"),
    });

    addServerHandler({
      route: "/api/authbound/session",
      method: "post",
      handler: resolver.resolve("./runtime/server/api/session"),
    });

    // Transpile runtime
    nuxt.options.build.transpile.push(resolver.resolve("./runtime"));
  },
});

declare module "@nuxt/schema" {
  interface PublicRuntimeConfig {
    authbound: {
      policyId?: PolicyId | string;
      publishableKey?: string;
      verifyPath?: string;
      verificationEndpoint?: string;
      sessionEndpoint?: string;
      sessionMode?: "sdk" | "manual";
      debug?: boolean;
    };
  }
  interface RuntimeConfig {
    authbound: {
      policyId?: PolicyId | string;
      provider?: "auto" | "vcs" | "eudi";
      apiKey?: string;
      sessionSecret?: string;
      webhookSecret?: string;
      webhookTolerance?: number;
      publicRoutes?: string[];
      protectedRoutes?: string[];
      cookieName?: string;
      middleware?: boolean;
      unsafeSkipWebhookSignatureVerification?: boolean;
    };
  }
}
