/**
 * Express.js route handlers for Authbound verification.
 *
 * @example
 * ```ts
 * import express from 'express';
 * import { createAuthboundRouter } from '@authbound/server/express';
 *
 * const app = express();
 * app.use(express.json());
 * app.use(cookieParser());
 *
 * app.use('/api/authbound', createAuthboundRouter(config, {
 *   onWebhook: async (event) => {
 *     console.log('Webhook received:', event);
 *   },
 * }));
 * ```
 */

import { type Request, type Response, Router } from "express";
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
    req: Request,
    event: WebhookEvent
  ) => boolean | Promise<boolean>;

  /**
   * Get the customer_user_ref for the current user.
   * Useful when integrating with existing auth systems.
   */
  getUserRef?: (req: Request) => string | Promise<string>;
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
  req: Request,
  res: Response,
  config: AuthboundConfig,
  options: HandlersOptions,
  client: AuthboundClient
): Promise<void> {
  try {
    // Parse request body
    let body: z.infer<typeof CreateVerificationRequestSchema> = {};
    try {
      body = CreateVerificationRequestSchema.parse(req.body || {});
    } catch {
      // Body might be empty or invalid - use defaults
    }

    // Get user ref from custom handler or generate one
    const userRef =
      body.customer_user_ref ??
      (options.getUserRef
        ? await options.getUserRef(req)
        : `user_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`);

    // Build callback URL if configured
    const protocol = req.protocol;
    const host = req.get("host");
    const baseUrl = `${protocol}://${host}`;

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

    res.status(200).json(verificationResponse);
  } catch (error) {
    if (error instanceof AuthboundClientError) {
      logError(error, "Verification creation", config.debug);
      res.status(error.statusCode ?? 500).json({
        error: error.message,
        code: error.code,
      });
      return;
    }
    logError(error, "Verification creation", config.debug);
    const safeError = createSafeErrorResponse(error, 500, config.debug);
    res.status(500).json({ error: safeError.message, code: safeError.code });
  }
}

async function handleWebhook(
  req: Request,
  res: Response,
  config: AuthboundConfig,
  options: HandlersOptions
): Promise<void> {
  try {
    const parsed = WebhookEventSchema.safeParse(req.body);

    if (!parsed.success) {
      logError(
        new Error(`Invalid webhook event: ${parsed.error.message}`),
        "Webhook",
        config.debug
      );
      res.status(400).json({
        error: "Invalid webhook event",
        code: "INVALID_PAYLOAD",
      });
      return;
    }

    const event = parsed.data;
    const session = event.data.object;

    // Validate signature if handler provided
    if (options.validateWebhookSignature) {
      const isValid = await options.validateWebhookSignature(req, event);
      if (!isValid) {
        logError(
          new Error("Invalid webhook signature"),
          "Webhook",
          config.debug
        );
        res.status(401).json({
          error: "Invalid signature",
          code: "INVALID_SIGNATURE",
        });
        return;
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
    await setVerificationCookie(res, config, {
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

    res.status(200).json({ success: true });
  } catch (error) {
    logError(error, "Webhook", config.debug);
    const safeError = createSafeErrorResponse(error, 500, config.debug);
    res.status(500).json({ error: safeError.message, code: safeError.code });
  }
}

async function handleGetStatus(
  req: Request,
  res: Response,
  config: AuthboundConfig
): Promise<void> {
  try {
    const verification = await getVerificationFromCookie(req, config);

    const statusResponse: VerificationStatusResponse = {
      verification,
      isVerified: verification?.isVerified ?? false,
    };

    res.status(200).json(statusResponse);
  } catch (error) {
    logError(error, "Status check", config.debug);
    const safeError = createSafeErrorResponse(error, 500, config.debug);
    res.status(500).json({ error: safeError.message, code: safeError.code });
  }
}

async function handleSignOut(
  _req: Request,
  res: Response,
  config: AuthboundConfig
): Promise<void> {
  try {
    clearVerificationCookie(res, config);

    if (config.debug) {
      console.log("[Authbound] Session cleared");
    }

    res.status(200).json({ success: true });
  } catch (error) {
    logError(error, "Sign out", config.debug);
    const safeError = createSafeErrorResponse(error, 500, config.debug);
    res.status(500).json({ error: safeError.message, code: safeError.code });
  }
}

// ============================================================================
// Router Factory
// ============================================================================

/**
 * Create an Express Router with all Authbound endpoints.
 *
 * Routes:
 * - POST /         - Create a verification session
 * - POST /callback - Handle webhook callbacks
 * - GET /status    - Get current session status
 * - DELETE /       - Sign out (clear session)
 *
 * @example
 * ```ts
 * import express from 'express';
 * import cookieParser from 'cookie-parser';
 * import { createAuthboundRouter } from '@authbound/server/express';
 *
 * const app = express();
 * app.use(express.json());
 * app.use(cookieParser());
 *
 * app.use('/api/authbound', createAuthboundRouter(config, {
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
export function createAuthboundRouter(
  config: AuthboundConfig,
  options: HandlersOptions = {}
): Router {
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

  const router = Router();

  // Verification creation
  router.post("/", (req, res) => {
    handleCreateVerification(req, res, validatedConfig, options, client);
  });

  router.post("/verification", (req, res) => {
    handleCreateVerification(req, res, validatedConfig, options, client);
  });

  // Webhook callback
  router.post("/callback", (req, res) => {
    handleWebhook(req, res, validatedConfig, options);
  });

  // Status check
  router.get("/", (req, res) => {
    handleGetStatus(req, res, validatedConfig);
  });

  router.get("/status", (req, res) => {
    handleGetStatus(req, res, validatedConfig);
  });

  // Sign out
  router.delete("/", (req, res) => {
    handleSignOut(req, res, validatedConfig);
  });

  router.post("/signout", (req, res) => {
    handleSignOut(req, res, validatedConfig);
  });

  return router;
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
): (req: Request, res: Response) => Promise<void> {
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

  return (req, res) =>
    handleCreateVerification(req, res, validatedConfig, options, client);
}

/**
 * Create a standalone webhook handler.
 */
export function createWebhookHandler(
  config: AuthboundConfig,
  options: HandlersOptions = {}
): (req: Request, res: Response) => Promise<void> {
  const validatedConfig = parseConfig(config);
  return (req, res) => handleWebhook(req, res, validatedConfig, options);
}

/**
 * Create a standalone status handler.
 */
export function createStatusHandler(
  config: AuthboundConfig
): (req: Request, res: Response) => Promise<void> {
  const validatedConfig = parseConfig(config);
  return (req, res) => handleGetStatus(req, res, validatedConfig);
}

/**
 * Create a standalone sign-out handler.
 */
export function createSignOutHandler(
  config: AuthboundConfig
): (req: Request, res: Response) => Promise<void> {
  const validatedConfig = parseConfig(config);
  return (req, res) => handleSignOut(req, res, validatedConfig);
}
