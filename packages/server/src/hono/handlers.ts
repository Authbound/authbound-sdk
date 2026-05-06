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
import { z } from "zod";
import { AuthboundClient, AuthboundClientError } from "../core/client";
import { createSafeErrorResponse, logError } from "../core/error-utils";
import type {
  AuthboundConfig,
  CreateVerificationResponse,
  VerificationStatusResponse,
  WebhookEvent,
} from "../core/types";
import { calculateAge, parseConfig, WebhookEventSchema } from "../core/types";
import { verifyWebhookSignatureDetailed } from "../core/webhooks";
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

// ============================================================================
// Request Schemas
// ============================================================================

const CreateVerificationRequestSchema = z.object({
  policyId: z.string(),
  customerUserRef: z.string().optional(),
  metadata: z.record(z.string(), z.string()).optional(),
  provider: z.enum(["auto", "vcs", "eudi"]).optional(),
});

const FinalizeVerificationRequestSchema = z.object({
  verificationId: z.string(),
  clientToken: z.string(),
});

function isSameOriginSessionRequest(c: Context): boolean {
  const origin = c.req.header("origin");
  if (origin && origin !== new URL(c.req.url).origin) {
    return false;
  }

  return c.req.header("sec-fetch-site") !== "cross-site";
}

// ============================================================================
// Handler Implementations
// ============================================================================

class BrowserVerificationResponseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BrowserVerificationResponseError";
  }
}

function getBrowserWalletUrl(result: {
  verificationUrl?: string;
  clientAction?: { kind: string; data: string };
}): { authorizationRequestUrl: string; deepLink?: string } {
  const linkAction =
    result.clientAction?.kind === "link" ? result.clientAction.data : undefined;
  const authorizationRequestUrl = result.verificationUrl ?? linkAction;

  if (!authorizationRequestUrl) {
    throw new BrowserVerificationResponseError(
      "Authbound did not return a browser-compatible wallet URL for this verification."
    );
  }

  return {
    authorizationRequestUrl,
    deepLink: linkAction,
  };
}

function toBrowserVerificationResponse(result: {
  id: string;
  clientToken?: string;
  expiresAt?: string;
  verificationUrl?: string;
  clientAction?: { kind: string; data: string; expiresAt?: string };
}): CreateVerificationResponse {
  const { authorizationRequestUrl, deepLink } = getBrowserWalletUrl(result);
  const expiresAt = result.expiresAt ?? result.clientAction?.expiresAt;

  if (!(result.clientToken && expiresAt)) {
    throw new BrowserVerificationResponseError(
      "Authbound verification response is missing client token or expiry."
    );
  }

  return {
    verificationId: result.id,
    authorizationRequestUrl,
    clientToken: result.clientToken,
    expiresAt,
    deepLink,
  };
}

function getPublishableKey(config: AuthboundConfig): string | undefined {
  return (
    config.publishableKey ??
    process.env.AUTHBOUND_PUBLISHABLE_KEY ??
    process.env.NEXT_PUBLIC_AUTHBOUND_PK ??
    process.env.NUXT_PUBLIC_AUTHBOUND_PK ??
    process.env.VITE_AUTHBOUND_PK
  );
}

function getBirthDate(
  attributes: Record<string, unknown> | undefined
): string | undefined {
  if (typeof attributes?.birth_date === "string") {
    return attributes.birth_date;
  }
  if (typeof attributes?.dateOfBirth === "string") {
    return attributes.dateOfBirth;
  }
  return;
}

async function handleCreateVerification(
  c: Context,
  config: AuthboundConfig,
  options: HandlersOptions,
  client: AuthboundClient
): Promise<Response> {
  try {
    const rawBody = await c.req.json().catch(() => ({}));
    const body = CreateVerificationRequestSchema.parse(rawBody);
    const userRef =
      body.customerUserRef ??
      (options.getUserRef ? await options.getUserRef(c) : undefined);

    const result = await client.verifications.create({
      policyId: body.policyId,
      customerUserRef: userRef,
      metadata: body.metadata,
      provider: body.provider,
    });

    const verificationResponse = toBrowserVerificationResponse(result);

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

    await setPendingVerificationCookie(c, config, {
      userRef: userRef ?? result.id,
      verificationId: verificationResponse.verificationId,
    });

    return c.json(verificationResponse, 200);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return c.json(
        {
          error: "Invalid request",
          code: "INVALID_REQUEST",
        },
        400
      );
    }
    if (error instanceof BrowserVerificationResponseError) {
      return c.json(
        {
          error: error.message,
          code: "INVALID_GATEWAY_RESPONSE",
        },
        502
      );
    }
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
    const rawBody = await c.req.text();

    if (options.validateWebhookSignature) {
      const isValid = await options.validateWebhookSignature(c, rawBody);
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
    } else if (!config.unsafeSkipWebhookSignatureVerification) {
      if (!config.webhookSecret) {
        return c.json(
          {
            error: "Webhook secret is required",
            code: "WEBHOOK_SECRET_MISSING",
          },
          500
        );
      }
      const signature = c.req.header("x-authbound-signature");
      if (!signature) {
        return c.json(
          {
            error: "Missing signature",
            code: "MISSING_SIGNATURE",
          },
          401
        );
      }
      const verification = verifyWebhookSignatureDetailed({
        payload: rawBody,
        signature,
        secret: config.webhookSecret,
        tolerance: config.webhookTolerance,
      });
      if (!verification.valid) {
        return c.json(
          {
            error: verification.error ?? "Invalid signature",
            code: "INVALID_SIGNATURE",
          },
          401
        );
      }
    }

    const parsed = WebhookEventSchema.safeParse(JSON.parse(rawBody));

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

    // Call custom webhook handler
    if (options.onWebhook) {
      await options.onWebhook(event);
    }

    if (config.debug) {
      console.log("[Authbound] Webhook processed:", {
        eventId: event.id,
        eventType: event.type,
        verificationId: event.data.object.id,
        status: event.data.object.status,
      });
    }

    return c.json({ received: true }, 200);
  } catch (error) {
    logError(error, "Webhook", config.debug);
    const safeError = createSafeErrorResponse(error, 500, config.debug);
    return c.json({ error: safeError.message, code: safeError.code }, 500);
  }
}

async function handleFinalizeSession(
  c: Context,
  config: AuthboundConfig,
  options: HandlersOptions,
  client: AuthboundClient
): Promise<Response> {
  try {
    if (!isSameOriginSessionRequest(c)) {
      return c.json(
        {
          error: "Cross-origin session finalization is not allowed",
          code: "CROSS_ORIGIN_FORBIDDEN",
        },
        403
      );
    }

    const rawBody = await c.req.json().catch(() => ({}));
    const parsed = FinalizeVerificationRequestSchema.safeParse(rawBody);
    if (!parsed.success) {
      return c.json(
        {
          error: "Invalid request",
          code: "INVALID_REQUEST",
        },
        400
      );
    }

    const publishableKey = getPublishableKey(config);
    if (!publishableKey) {
      return c.json(
        {
          error: "Authbound publishable key is not configured",
          code: "PUBLISHABLE_KEY_MISSING",
        },
        500
      );
    }

    const { verificationId, clientToken } = parsed.data;
    const pendingVerification = await getPendingVerificationFromCookie(
      c,
      config
    );
    if (
      !pendingVerification ||
      pendingVerification.status !== "PENDING" ||
      pendingVerification.verificationId !== verificationId
    ) {
      return c.json(
        {
          error:
            "Verification finalization is not bound to this browser session",
          code: "VERIFICATION_BINDING_REQUIRED",
        },
        403
      );
    }

    const userRef = options.getUserRef
      ? await options.getUserRef(c)
      : pendingVerification.userRef;
    if (userRef !== pendingVerification.userRef) {
      return c.json(
        {
          error: "Verification finalization is not bound to the current user",
          code: "VERIFICATION_BINDING_REQUIRED",
        },
        403
      );
    }

    const status = await client.verifications.getStatus(verificationId, {
      clientToken,
      publishableKey,
    });

    if (status.status !== "verified" || status.result?.verified === false) {
      return c.json(
        {
          error: "Verification is not verified",
          code: "VERIFICATION_NOT_VERIFIED",
        },
        409
      );
    }

    const attributes = status.result?.attributes;
    const birthDate = getBirthDate(attributes);
    const age =
      typeof attributes?.age === "number"
        ? attributes.age
        : birthDate
          ? calculateAge(birthDate)
          : undefined;

    await setVerificationCookie(c, config, {
      userRef,
      verificationId,
      status: "VERIFIED",
      assuranceLevel: "SUBSTANTIAL",
      age,
      dateOfBirth: birthDate,
    });
    clearPendingVerificationCookie(c, config);

    return c.json(
      {
        isVerified: true,
        verificationId,
        status: status.status,
      },
      200
    );
  } catch (error) {
    if (error instanceof AuthboundClientError) {
      logError(error, "Session finalization", config.debug);
      const statusCode = (error.statusCode ?? 500) as
        | 400
        | 401
        | 403
        | 404
        | 409
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
    logError(error, "Session finalization", config.debug);
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
    clearPendingVerificationCookie(c, config);

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
