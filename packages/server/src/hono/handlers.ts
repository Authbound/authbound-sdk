/**
 * Hono route handlers for Authbound verification.
 *
 * @example
 * ```ts
 * import { Hono } from 'hono';
 * import { createAuthboundApp } from '@authbound/server/hono';
 *
 * const app = new Hono();
 *
 * app.route('/api/authbound', createAuthboundApp(config, {
 *   onWebhook: async (event) => {
 *     console.log('Webhook received:', event);
 *   },
 * }));
 * ```
 */

import type { Context } from "hono";
import { Hono } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { AuthboundClient } from "../core/client";
import {
  createVerificationHandlerKernel,
  finalizeSessionHandlerKernel,
  getStatusHandlerKernel,
  type HandlerKernelCookieEffects,
  type HandlerKernelResponse,
  mapHandlerKernelException,
  processWebhookHandlerKernel,
  signOutHandlerKernel,
} from "../core/handler-kernel";
import type {
  AuthboundConfig,
  CreateVerificationResponse,
  WebhookEvent,
} from "../core/types";
import { parseConfig } from "../core/types";
import {
  clearPendingVerificationCookie,
  clearVerificationCookie,
  getPendingVerificationFromCookie,
  getVerificationFromCookie,
  setPendingVerificationCookie,
  setVerificationCookie,
} from "./cookies";

// ============================================================================
// Types
// ============================================================================

export interface HandlersOptions {
  /**
   * Custom handler called when a webhook event is received.
   * Use this to sync verification status with your database.
   */
  onWebhook?: (event: WebhookEvent) => void | Promise<void>;

  /**
   * Custom handler called when a verification is created.
   */
  onVerificationCreated?: (
    response: CreateVerificationResponse
  ) => void | Promise<void>;

  /**
   * Custom handler called when a verified webhook event is received.
   */
  onVerified?: (event: WebhookEvent) => void | Promise<void>;

  /**
   * Custom handler called when a failed webhook event is received.
   */
  onFailed?: (event: WebhookEvent) => void | Promise<void>;

  /**
   * Custom handler to validate the webhook signature.
   * Return true if valid, false if invalid.
   */
  validateWebhookSignature?: (
    c: Context,
    rawBody: string
  ) => boolean | Promise<boolean>;

  /**
   * Get the customer_user_ref for the current user.
   * Useful when integrating with existing auth systems.
   */
  getUserRef?: (c: Context) => string | Promise<string>;
}

function sessionOriginRequest(c: Context) {
  return {
    url: c.req.url,
    headers: {
      get: (name: string) => c.req.header(name) ?? null,
    },
  };
}

async function applyCookieEffects(
  c: Context,
  config: AuthboundConfig,
  effects: HandlerKernelCookieEffects | undefined
): Promise<void> {
  if (!effects) {
    return;
  }
  if (effects.setVerification) {
    await setVerificationCookie(c, config, effects.setVerification);
  }
  if (effects.clearVerification) {
    clearVerificationCookie(c, config);
  }
  if (effects.setPendingVerification) {
    await setPendingVerificationCookie(
      c,
      config,
      effects.setPendingVerification
    );
  }
  if (effects.clearPendingVerification) {
    clearPendingVerificationCookie(c, config);
  }
}

async function sendKernelResponse(
  c: Context,
  config: AuthboundConfig,
  result: HandlerKernelResponse
): Promise<Response> {
  try {
    await applyCookieEffects(c, config, result.cookies);
    return c.json(result.body, result.status as ContentfulStatusCode);
  } catch (error) {
    const mapped = mapHandlerKernelException(error, "Cookie handling", config);
    return c.json(mapped.body, mapped.status as ContentfulStatusCode);
  }
}

// ============================================================================
// Handler Implementations
// ============================================================================

async function handleCreateVerification(
  c: Context,
  config: AuthboundConfig,
  options: HandlersOptions,
  client: AuthboundClient
): Promise<Response> {
  const getUserRef = options.getUserRef;
  return sendKernelResponse(
    c,
    config,
    await createVerificationHandlerKernel({
      requestBody: await c.req.json().catch(() => null),
      config,
      client,
      idempotencyKey: c.req.header("idempotency-key") ?? undefined,
      getUserRef: getUserRef ? () => getUserRef(c) : undefined,
      onVerificationCreated: options.onVerificationCreated,
    })
  );
}

async function handleWebhook(
  c: Context,
  config: AuthboundConfig,
  options: HandlersOptions
): Promise<Response> {
  return sendKernelResponse(
    c,
    config,
    await processWebhookHandlerKernel({
      rawBody: await c.req.text(),
      signature: c.req.header("x-authbound-signature"),
      config,
      validateWebhookSignature: options.validateWebhookSignature
        ? (rawBody) => options.validateWebhookSignature?.(c, rawBody) ?? false
        : undefined,
      onWebhook: options.onWebhook,
      onVerified: options.onVerified,
      onFailed: options.onFailed,
    })
  );
}

async function handleFinalizeSession(
  c: Context,
  config: AuthboundConfig,
  options: HandlersOptions,
  client: AuthboundClient
): Promise<Response> {
  const getUserRef = options.getUserRef;
  return sendKernelResponse(
    c,
    config,
    await finalizeSessionHandlerKernel({
      request: sessionOriginRequest(c),
      requestBody: await c.req.json().catch(() => null),
      pendingVerification: await getPendingVerificationFromCookie(c, config),
      config,
      client,
      getUserRef: getUserRef ? () => getUserRef(c) : undefined,
    })
  );
}

async function handleGetStatus(
  c: Context,
  config: AuthboundConfig
): Promise<Response> {
  return sendKernelResponse(
    c,
    config,
    await getStatusHandlerKernel({
      config,
      getVerification: () => getVerificationFromCookie(c, config),
    })
  );
}

async function handleSignOut(
  c: Context,
  config: AuthboundConfig
): Promise<Response> {
  return sendKernelResponse(c, config, await signOutHandlerKernel({ config }));
}

// ============================================================================
// App Factory
// ============================================================================

/**
 * Create a Hono app with all Authbound endpoints.
 *
 * Routes:
 * - POST /         - Create a verification
 * - POST /callback - Handle webhook callbacks
 * - GET /          - Get current browser session status
 * - GET /status    - Get current browser session status (alias)
 * - DELETE /       - Sign out (clear session)
 * - POST /signout  - Sign out (alias)
 *
 * @example
 * ```ts
 * import { Hono } from 'hono';
 * import { createAuthboundApp } from '@authbound/server/hono';
 *
 * const app = new Hono();
 *
 * app.route('/api/authbound', createAuthboundApp(config, {
 *   onWebhook: async (event) => {
 *     // Sync with your database
 *     await db.verifications.update({
 *       verificationId: event.data.object.id,
 *       status: event.data.object.status,
 *     });
 *   },
 * }));
 * ```
 */
export function createAuthboundApp(
  config: AuthboundConfig,
  options: HandlersOptions = {}
): Hono {
  const validatedConfig = parseConfig(config);

  // Create shared AuthboundClient instance
  const client = new AuthboundClient({
    apiKey: validatedConfig.apiKey,
    apiUrl:
      validatedConfig.apiUrl ??
      process.env.AUTHBOUND_API_URL ??
      "https://api.authbound.io",
    debug: validatedConfig.debug,
  });

  const app = new Hono();

  // Verification creation
  app.post("/", (c) =>
    handleCreateVerification(c, validatedConfig, options, client)
  );

  app.post("/verification", (c) =>
    handleCreateVerification(c, validatedConfig, options, client)
  );

  app.post("/session", (c) =>
    handleFinalizeSession(c, validatedConfig, options, client)
  );

  // Webhook callback
  app.post("/callback", (c) => handleWebhook(c, validatedConfig, options));

  // Status check
  app.get("/", (c) => handleGetStatus(c, validatedConfig));

  app.get("/status", (c) => handleGetStatus(c, validatedConfig));

  // Sign out
  app.delete("/", (c) => handleSignOut(c, validatedConfig));

  app.post("/signout", (c) => handleSignOut(c, validatedConfig));

  return app;
}

// ============================================================================
// Standalone Handlers
// ============================================================================

/**
 * Create a standalone verification creation handler.
 */
export function createVerificationHandler(
  config: AuthboundConfig,
  options: HandlersOptions = {}
): (c: Context) => Promise<Response> {
  const validatedConfig = parseConfig(config);

  // Create AuthboundClient instance
  const client = new AuthboundClient({
    apiKey: validatedConfig.apiKey,
    apiUrl:
      validatedConfig.apiUrl ??
      process.env.AUTHBOUND_API_URL ??
      "https://api.authbound.io",
    debug: validatedConfig.debug,
  });

  return (c) => handleCreateVerification(c, validatedConfig, options, client);
}

/**
 * Create a standalone webhook handler.
 */
export function createWebhookHandler(
  config: AuthboundConfig,
  options: HandlersOptions = {}
): (c: Context) => Promise<Response> {
  const validatedConfig = parseConfig(config);
  return (c) => handleWebhook(c, validatedConfig, options);
}

/**
 * Create a standalone browser session finalization handler.
 */
export function createSessionHandler(
  config: AuthboundConfig,
  options: HandlersOptions = {}
): (c: Context) => Promise<Response> {
  const validatedConfig = parseConfig(config);
  const client = new AuthboundClient({
    apiKey: validatedConfig.apiKey,
    apiUrl:
      validatedConfig.apiUrl ??
      process.env.AUTHBOUND_API_URL ??
      "https://api.authbound.io",
    debug: validatedConfig.debug,
  });
  return (c) => handleFinalizeSession(c, validatedConfig, options, client);
}

/**
 * Create a standalone status handler.
 */
export function createStatusHandler(
  config: AuthboundConfig
): (c: Context) => Promise<Response> {
  const validatedConfig = parseConfig(config);
  return (c) => handleGetStatus(c, validatedConfig);
}

/**
 * Create a standalone sign-out handler.
 */
export function createSignOutHandler(
  config: AuthboundConfig
): (c: Context) => Promise<Response> {
  const validatedConfig = parseConfig(config);
  return (c) => handleSignOut(c, validatedConfig);
}
