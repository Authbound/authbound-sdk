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
  CreateSessionResponse,
  SessionStatusResponse,
  WebhookEvent,
} from "../core/types";
import {
  calculateAgeFromDob,
  mapSessionStatusToVerificationStatus,
  parseConfig,
  WebhookEventSchema,
} from "../core/types";
import {
  clearSessionCookie,
  getSessionFromCookie,
  setSessionCookie,
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
   * Custom handler called when a session is created.
   */
  onSessionCreated?: (response: CreateSessionResponse) => void | Promise<void>;

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

const CreateSessionRequestSchema = z.object({
  customer_user_ref: z.string().optional(),
  callback_url: z.string().url().optional(),
});

// ============================================================================
// Handler Implementations
// ============================================================================

async function handleCreateSession(
  c: Context,
  config: AuthboundConfig,
  options: HandlersOptions,
  client: AuthboundClient
): Promise<Response> {
  try {
    // Parse request body
    let body: z.infer<typeof CreateSessionRequestSchema> = {};
    try {
      const rawBody = await c.req.json();
      body = CreateSessionRequestSchema.parse(rawBody);
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

    // Use AuthboundClient to create session
    const result = await client.sessions.create({
      userRef,
      callbackUrl,
    });

    const sessionResponse: CreateSessionResponse = {
      clientToken: result.clientToken,
      sessionId: result.sessionId,
      expiresAt: result.expiresAt,
    };

    // Call custom handler if provided
    if (options.onSessionCreated) {
      await options.onSessionCreated(sessionResponse);
    }

    if (config.debug) {
      console.log("[Authbound] Session created:", sessionResponse.sessionId);
    }

    return c.json(sessionResponse, 200);
  } catch (error) {
    if (error instanceof AuthboundClientError) {
      logError(error, "Session creation", config.debug);
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
    logError(error, "Session creation", config.debug);
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
    await setSessionCookie(c, config, {
      userRef: session.client_reference_id,
      sessionId: session.id,
      status: mapSessionStatusToVerificationStatus(session.status),
      assuranceLevel: "SUBSTANTIAL",
      age,
      dateOfBirth,
    });

    if (config.debug) {
      console.log("[Authbound] Webhook processed:", {
        eventId: event.id,
        eventType: event.type,
        sessionId: session.id,
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
    const session = await getSessionFromCookie(c, config);

    const statusResponse: SessionStatusResponse = {
      session,
      isVerified: session?.isVerified ?? false,
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
    clearSessionCookie(c, config);

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
 *       sessionId: event.data.object.id,
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

  // Session creation
  app.post("/", (c) =>
    handleCreateSession(c, validatedConfig, options, client)
  );

  app.post("/session", (c) =>
    handleCreateSession(c, validatedConfig, options, client)
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
 * Create a standalone session creation handler.
 */
export function createSessionHandler(
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

  return (c) => handleCreateSession(c, validatedConfig, options, client);
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
