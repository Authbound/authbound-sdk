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
 *     policyId: 'age-gate-18@1.0.0',
 *   },
 * });
 * ```
 */

import type { PolicyId } from "@authbound/core";
import {
  addComponent,
  addImports,
  addPlugin,
  addServerHandler,
  createResolver,
  defineNuxtModule,
} from "@nuxt/kit";

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
  policyId?: PolicyId;

  /**
   * Path to redirect for verification.
   * @default '/verify'
   */
  verifyPath?: string;

  /**
   * Cookie name for session storage.
   * @default 'authbound_session'
   */
  cookieName?: string;

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
    verifyPath: "/verify",
    cookieName: "authbound_session",
    middleware: true,
    debug: false,
  },
  setup(options, nuxt) {
    const resolver = createResolver(import.meta.url);

    // Provide options to runtime
    nuxt.options.runtimeConfig.public.authbound = {
      policyId: options.policyId,
      verifyPath: options.verifyPath,
      debug: options.debug,
    };

    nuxt.options.runtimeConfig.authbound = {
      publicRoutes: options.publicRoutes,
      protectedRoutes: options.protectedRoutes,
      cookieName: options.cookieName,
      middleware: options.middleware,
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
      route: "/api/authbound/session",
      method: "post",
      handler: resolver.resolve("./runtime/server/api/session"),
    });

    addServerHandler({
      route: "/api/authbound/webhook",
      method: "post",
      handler: resolver.resolve("./runtime/server/api/webhook"),
    });

    // Transpile runtime
    nuxt.options.build.transpile.push(resolver.resolve("./runtime"));
  },
});

declare module "@nuxt/schema" {
  interface PublicRuntimeConfig {
    authbound: {
      policyId?: PolicyId;
      verifyPath?: string;
      debug?: boolean;
    };
  }
  interface RuntimeConfig {
    authbound: {
      publicRoutes?: string[];
      protectedRoutes?: string[];
      cookieName?: string;
      middleware?: boolean;
    };
  }
}
