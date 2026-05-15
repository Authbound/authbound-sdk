/**
 * Express.js route handlers for Authbound verification.
 *
 * @example
 * ```ts
 * import express from 'express';
 * import { createAuthboundRouter } from '@authbound/server/express';
 *
 * const app = express();
 * app.use(express.json({
 *   verify: (req, _res, buf) => {
 *     (req as express.Request & { rawBody?: Buffer }).rawBody = Buffer.from(buf);
 *   },
 * }));
 * app.use(cookieParser());
 *
 * app.use('/api/authbound', createAuthboundRouter(config, {
 *   onWebhook: async (event) => {
 *     console.log('Webhook received:', event);
 *   },
 * }));
 * ```
 */

import {
  isSameOriginSessionRequest,
  ProviderPreferenceSchema,
} from "@authbound/core";
import { type Request, type Response, Router } from "express";
import { z } from "zod";
import {
  BrowserVerificationResponseError,
  BrowserWalletUrlError,
  toBrowserVerificationResponse,
} from "../core/browser-verification";
import { AuthboundClient, AuthboundClientError } from "../core/client";
import { createSafeErrorResponse, logError } from "../core/error-utils";
import { toVerifiedSessionFinalization } from "../core/session-finalization";
import type {
  AuthboundConfig,
  CreateVerificationResponse,
  VerificationStatusResponse,
  WebhookEvent,
} from "../core/types";
import { parseConfig, WebhookEventSchema } from "../core/types";
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
    req: Request,
    rawBody: string
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
  policyId: z.string(),
  customerUserRef: z.string().optional(),
  metadata: z.record(z.string(), z.string()).optional(),
  provider: ProviderPreferenceSchema.optional(),
});

const FinalizeVerificationRequestSchema = z.object({
  verificationId: z.string(),
  clientToken: z.string(),
});

function sessionOriginRequest(req: Request) {
  const host = req.get("host") ?? "localhost";
  const path = req.originalUrl || req.url || "/";
  const protocol = (req.socket as typeof req.socket & { encrypted?: boolean })
    .encrypted
    ? "https"
    : "http";
  return {
    url: `${protocol}://${host}${path}`,
    headers: {
      get: (name: string) => req.get(name) ?? null,
    },
  };
}

// ============================================================================
// Handler Implementations
// ============================================================================

function getRawBody(req: Request): string | null {
  const rawBody = (req as Request & { rawBody?: string | Buffer }).rawBody;
  if (typeof rawBody === "string") {
    return rawBody;
  }
  if (Buffer.isBuffer(rawBody)) {
    return rawBody.toString("utf8");
  }
  if (typeof req.body === "string") {
    return req.body;
  }
  if (Buffer.isBuffer(req.body)) {
    return req.body.toString("utf8");
  }
  return null;
}

async function handleCreateVerification(
  req: Request,
  res: Response,
  config: AuthboundConfig,
  options: HandlersOptions,
  client: AuthboundClient
): Promise<void> {
  try {
    const body = CreateVerificationRequestSchema.parse(req.body || {});
    const userRef =
      body.customerUserRef ??
      (options.getUserRef ? await options.getUserRef(req) : undefined);

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

    await setPendingVerificationCookie(res, config, {
      userRef: userRef ?? result.id,
      verificationId: verificationResponse.verificationId,
    });

    res.status(200).json(verificationResponse);
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({
        error: "Invalid request",
        code: "INVALID_REQUEST",
      });
      return;
    }
    if (error instanceof BrowserWalletUrlError) {
      res.status(502).json({
        error: error.message,
        code: "BROWSER_WALLET_URL_MISSING",
      });
      return;
    }
    if (error instanceof BrowserVerificationResponseError) {
      res.status(502).json({
        error: error.message,
        code: "INVALID_GATEWAY_RESPONSE",
      });
      return;
    }
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
    const rawBody = getRawBody(req);

    if (options.validateWebhookSignature) {
      if (!rawBody) {
        res.status(400).json({
          error: "Raw request body is required for webhook verification",
          code: "RAW_BODY_REQUIRED",
        });
        return;
      }
      const isValid = await options.validateWebhookSignature(req, rawBody);
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
    } else if (!config.unsafeSkipWebhookSignatureVerification) {
      if (!config.webhookSecret) {
        res.status(500).json({
          error: "Webhook secret is required",
          code: "WEBHOOK_SECRET_MISSING",
        });
        return;
      }
      if (!rawBody) {
        res.status(400).json({
          error: "Raw request body is required for webhook verification",
          code: "RAW_BODY_REQUIRED",
        });
        return;
      }
      const signature = req.get("x-authbound-signature");
      if (!signature) {
        res.status(401).json({
          error: "Missing signature",
          code: "MISSING_SIGNATURE",
        });
        return;
      }
      const verification = verifyWebhookSignatureDetailed({
        payload: rawBody,
        signature,
        secret: config.webhookSecret,
        tolerance: config.webhookTolerance,
      });
      if (!verification.valid) {
        res.status(401).json({
          error: verification.error ?? "Invalid signature",
          code: "INVALID_SIGNATURE",
        });
        return;
      }
    }

    const payload =
      rawBody && typeof rawBody === "string" ? JSON.parse(rawBody) : req.body;
    const parsed = WebhookEventSchema.safeParse(payload);

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

    res.status(200).json({ received: true });
  } catch (error) {
    logError(error, "Webhook", config.debug);
    const safeError = createSafeErrorResponse(error, 500, config.debug);
    res.status(500).json({ error: safeError.message, code: safeError.code });
  }
}

async function handleFinalizeSession(
  req: Request,
  res: Response,
  config: AuthboundConfig,
  options: HandlersOptions,
  client: AuthboundClient
): Promise<void> {
  try {
    const originRequest = sessionOriginRequest(req);
    if (
      !isSameOriginSessionRequest(originRequest, {
        allowedOrigins: config.allowedOrigins,
        trustProxy: config.trustProxy,
      })
    ) {
      res.status(403).json({
        error: "Cross-origin session finalization is not allowed",
        code: "CROSS_ORIGIN_FORBIDDEN",
      });
      return;
    }

    const parsed = FinalizeVerificationRequestSchema.safeParse(req.body || {});
    if (!parsed.success) {
      res.status(400).json({
        error: "Invalid request",
        code: "INVALID_REQUEST",
      });
      return;
    }

    const { verificationId } = parsed.data;
    const pendingVerification = await getPendingVerificationFromCookie(
      req,
      config
    );
    if (
      !pendingVerification ||
      pendingVerification.status !== "PENDING" ||
      pendingVerification.verificationId !== verificationId
    ) {
      res.status(403).json({
        error: "Verification finalization is not bound to this browser session",
        code: "VERIFICATION_BINDING_REQUIRED",
      });
      return;
    }

    const userRef = options.getUserRef
      ? await options.getUserRef(req)
      : pendingVerification.userRef;
    if (userRef !== pendingVerification.userRef) {
      res.status(403).json({
        error: "Verification finalization is not bound to the current user",
        code: "VERIFICATION_BINDING_REQUIRED",
      });
      return;
    }

    const result = await client.verifications.getResult(verificationId);
    const verifiedSession = toVerifiedSessionFinalization(result);
    if (!verifiedSession) {
      res.status(409).json({
        error: "Verification is not verified",
        code: "VERIFICATION_NOT_VERIFIED",
      });
      return;
    }

    await setVerificationCookie(res, config, {
      userRef,
      verificationId,
      status: "VERIFIED",
      assuranceLevel: "SUBSTANTIAL",
      age: verifiedSession.age,
      dateOfBirth: verifiedSession.dateOfBirth,
    });
    clearPendingVerificationCookie(res, config);

    res.status(200).json({
      isVerified: true,
      verificationId,
      status: verifiedSession.status,
    });
  } catch (error) {
    if (error instanceof AuthboundClientError) {
      logError(error, "Session finalization", config.debug);
      res.status(error.statusCode ?? 500).json({
        error: error.message,
        code: error.code,
      });
      return;
    }
    logError(error, "Session finalization", config.debug);
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
    clearPendingVerificationCookie(res, config);

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
 * - POST /         - Create a verification
 * - POST /callback - Handle webhook callbacks
 * - GET /status    - Get current browser session status
 * - DELETE /       - Sign out (clear session)
 *
 * @example
 * ```ts
 * import express from 'express';
 * import cookieParser from 'cookie-parser';
 * import { createAuthboundRouter } from '@authbound/server/express';
 *
 * const app = express();
 * app.use(express.json({
 *   verify: (req, _res, buf) => {
 *     (req as express.Request & { rawBody?: Buffer }).rawBody = Buffer.from(buf);
 *   },
 * }));
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

  router.post("/session", (req, res) => {
    handleFinalizeSession(req, res, validatedConfig, options, client);
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
 * Create a standalone browser session finalization handler.
 */
export function createSessionHandler(
  config: AuthboundConfig,
  options: HandlersOptions = {}
): (req: Request, res: Response) => Promise<void> {
  const validatedConfig = parseConfig(config);
  const client = new AuthboundClient({
    apiKey: validatedConfig.apiKey,
    apiUrl:
      validatedConfig.apiUrl ??
      process.env.AUTHBOUND_API_URL ??
      "https://api.authbound.io",
    debug: validatedConfig.debug,
  });
  return (req, res) =>
    handleFinalizeSession(req, res, validatedConfig, options, client);
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
