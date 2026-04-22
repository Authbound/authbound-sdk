/**
 * Hono route handlers for Authbound verification.
 *
 * @example
 * ```ts
 * import { Hono } from 'hono';
 * import { createAuthboundApp } from '@authbound-sdk/server/hono';
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
import { z } from "zod";
import { AuthboundClient, AuthboundClientError } from "../core/client";
import { createSafeErrorResponse, logError } from "../core/error-utils";
import type {
  AuthboundConfig,
  CreateVerificationResponse,
  VerificationStatusResponse,
  WebhookEvent,
} from "../core/types";
import {
  calculateAgeFromDob,
  mapVerificationEventStatusToVerificationStatus,
  parseConfig,
  WebhookEventSchema,
} from "../core/types";
import {
  clearVerificationCookie,
  getVerificationFromCookie,
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
   * Custom handler to validate the webhook signature.
   * Return true if valid, false if invalid.
   */
  validateWebhookSignature?: (
    c: Context,
    event: WebhookEvent
  ) => boolean | Promise<boolean>;

  /**
   * Get the customer_user_ref for the current user.
   * Useful when integrating with existing auth systems.
   */
  getUserRef?: (c: Context) => string | Promise<string>;
}

// ============================================================================
// Request Schemas
// ============================================================================

const CreateVerificationRequestSchema = z.object({
  customer_user_ref: z.string().optional(),
  callback_url: z.string().url().optional(),
  policy_id: z.string().optional(),
});

// ============================================================================
// Handler Implementations
// ============================================================================

async function handleCreateVerification(
  c: Context,
  config: AuthboundConfig,
  options: HandlersOptions,
  client: AuthboundClient
): Promise<Response> {
  try {
    // Parse request body
    let body: z.infer<typeof CreateVerificationRequestSchema> = {};
    try {
      const rawBody = await c.req.json();
      body = CreateVerificationRequestSchema.parse(rawBody);
    } catch {
      // Body might be empty or invalid - use defaults
    }

    // Get user ref from custom handler or generate one
    const userRef =
      body.customer_user_ref ??
      (options.getUserRef
        ? await options.getUserRef(c)
        : `user_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`);

    // Build callback URL if configured
    const url = new URL(c.req.url);
    const baseUrl = `${url.protocol}//${url.host}`;

    const callbackUrl =
      body.callback_url ??
      (config.routes.callback
        ? new URL(config.routes.callback, baseUrl).toString()
        : undefined);

    const result = await client.verifications.create({
      policyId: body.policy_id ?? "default",
      customerUserRef: userRef,
      metadata: callbackUrl ? { callback_url: callbackUrl } : undefined,
    });

    const verificationResponse: CreateVerificationResponse = {
      clientToken: result.clientToken ?? "",
      verificationId: result.id,
      expiresAt: result.expiresAt,
    };

    // Call custom handler if provided
    if (options.onVerificationCreated) {
      await options.onVerificationCreated(verificationResponse);
    }

    if (config.debug) {
      console.log(
        "[Authbound] Verification created:",
        verificationResponse.verificationId
      );
    }

    return c.json(verificationResponse, 200);
  } catch (error) {
    if (error instanceof AuthboundClientError) {
      logError(error, "Verification creation", config.debug);
      const statusCode = (error.statusCode ?? 500) as
        | 400
        | 401
        | 403
        | 404
        | 500
        | 502
        | 503;
      return c.json(
        {
          error: error.message,
          code: error.code,
        },
        statusCode
      );
    }
    logError(error, "Verification creation", config.debug);
    const safeError = createSafeErrorResponse(error, 500, config.debug);
    return c.json({ error: safeError.message, code: safeError.code }, 500);
  }
}

async function handleWebhook(
  c: Context,
  config: AuthboundConfig,
  options: HandlersOptions
): Promise<Response> {
  try {
    const rawBody = await c.req.json();
    const parsed = WebhookEventSchema.safeParse(rawBody);

    if (!parsed.success) {
      logError(
        new Error(`Invalid webhook event: ${parsed.error.message}`),
        "Webhook",
        config.debug
      );
      return c.json(
        {
          error: "Invalid webhook event",
          code: "INVALID_PAYLOAD",
        },
        400
      );
    }

    const event = parsed.data;
    const session = event.data.object;

    // Validate signature if handler provided
    if (options.validateWebhookSignature) {
      const isValid = await options.validateWebhookSignature(c, event);
      if (!isValid) {
        logError(
          new Error("Invalid webhook signature"),
          "Webhook",
          config.debug
        );
        return c.json(
          {
            error: "Invalid signature",
            code: "INVALID_SIGNATURE",
          },
          401
        );
      }
    }

    // Call custom webhook handler
    if (options.onWebhook) {
      await options.onWebhook(event);
    }

    // Calculate age from DOB if available
    let age: number | undefined;
    if (session.verified_outputs?.dob) {
      try {
        age = calculateAgeFromDob(session.verified_outputs.dob);
      } catch (error) {
        logError(error, "Age calculation from DOB", config.debug);
      }
    }

    // Format DOB as ISO string
    const dateOfBirth = session.verified_outputs?.dob
      ? `${session.verified_outputs.dob.year}-${String(session.verified_outputs.dob.month).padStart(2, "0")}-${String(session.verified_outputs.dob.day).padStart(2, "0")}`
      : undefined;

    // Set the session cookie with verification data
    await setVerificationCookie(c, config, {
      userRef: session.client_reference_id,
      verificationId: session.id,
      status: mapVerificationEventStatusToVerificationStatus(session.status),
      assuranceLevel: "SUBSTANTIAL",
      age,
      dateOfBirth,
    });

    if (config.debug) {
      console.log("[Authbound] Webhook processed:", {
        eventId: event.id,
        eventType: event.type,
        verificationId: session.id,
        status: session.status,
      });
    }

    return c.json({ success: true }, 200);
  } catch (error) {
    logError(error, "Webhook", config.debug);
    const safeError = createSafeErrorResponse(error, 500, config.debug);
    return c.json({ error: safeError.message, code: safeError.code }, 500);
  }
}

async function handleGetStatus(
  c: Context,
  config: AuthboundConfig
): Promise<Response> {
  try {
    const verification = await getVerificationFromCookie(c, config);

    const statusResponse: VerificationStatusResponse = {
      verification,
      isVerified: verification?.isVerified ?? false,
    };

    return c.json(statusResponse, 200);
  } catch (error) {
    logError(error, "Status check", config.debug);
    const safeError = createSafeErrorResponse(error, 500, config.debug);
    return c.json({ error: safeError.message, code: safeError.code }, 500);
  }
}

async function handleSignOut(
  c: Context,
  config: AuthboundConfig
): Promise<Response> {
  try {
    clearVerificationCookie(c, config);

    if (config.debug) {
      console.log("[Authbound] Session cleared");
    }

    return c.json({ success: true }, 200);
  } catch (error) {
    logError(error, "Sign out", config.debug);
    const safeError = createSafeErrorResponse(error, 500, config.debug);
    return c.json({ error: safeError.message, code: safeError.code }, 500);
  }
}

// ============================================================================
// App Factory
// ============================================================================

/**
 * Create a Hono app with all Authbound endpoints.
 *
 * Routes:
 * - POST /         - Create a verification session
 * - POST /callback - Handle webhook callbacks
 * - GET /          - Get current session status
 * - GET /status    - Get current session status (alias)
 * - DELETE /       - Sign out (clear session)
 * - POST /signout  - Sign out (alias)
 *
 * @example
 * ```ts
 * import { Hono } from 'hono';
 * import { createAuthboundApp } from '@authbound-sdk/server/hono';
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
      "https://api.authbound.com",
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
      "https://api.authbound.com",
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
