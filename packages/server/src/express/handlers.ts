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

import { type Request, type Response, Router } from "express";
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
    req: Request,
    rawBody: string
  ) => boolean | Promise<boolean>;

  /**
   * Get the customer_user_ref for the current user.
   * Useful when integrating with existing auth systems.
   */
  getUserRef?: (req: Request) => string | Promise<string>;
}

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

async function applyCookieEffects(
  res: Response,
  config: AuthboundConfig,
  effects: HandlerKernelCookieEffects | undefined
): Promise<void> {
  if (!effects) {
    return;
  }
  if (effects.setVerification) {
    await setVerificationCookie(res, config, effects.setVerification);
  }
  if (effects.clearVerification) {
    clearVerificationCookie(res, config);
  }
  if (effects.setPendingVerification) {
    await setPendingVerificationCookie(
      res,
      config,
      effects.setPendingVerification
    );
  }
  if (effects.clearPendingVerification) {
    clearPendingVerificationCookie(res, config);
  }
}

async function sendKernelResponse(
  res: Response,
  config: AuthboundConfig,
  result: HandlerKernelResponse
): Promise<void> {
  try {
    await applyCookieEffects(res, config, result.cookies);
    res.status(result.status).json(result.body);
  } catch (error) {
    const mapped = mapHandlerKernelException(error, "Cookie handling", config);
    res.status(mapped.status).json(mapped.body);
  }
}

async function handleCreateVerification(
  req: Request,
  res: Response,
  config: AuthboundConfig,
  options: HandlersOptions,
  client: AuthboundClient
): Promise<void> {
  const getUserRef = options.getUserRef;
  await sendKernelResponse(
    res,
    config,
    await createVerificationHandlerKernel({
      requestBody: req.body ?? null,
      config,
      client,
      idempotencyKey: req.get("idempotency-key") ?? undefined,
      getUserRef: getUserRef ? () => getUserRef(req) : undefined,
      onVerificationCreated: options.onVerificationCreated,
    })
  );
}

async function handleWebhook(
  req: Request,
  res: Response,
  config: AuthboundConfig,
  options: HandlersOptions
): Promise<void> {
  const rawBody = getRawBody(req);
  await sendKernelResponse(
    res,
    config,
    await processWebhookHandlerKernel({
      rawBody,
      parsedBody: req.body,
      signature: req.get("x-authbound-signature"),
      config,
      validateWebhookSignature: options.validateWebhookSignature
        ? (body) => options.validateWebhookSignature?.(req, body) ?? false
        : undefined,
      onWebhook: options.onWebhook,
      onVerified: options.onVerified,
      onFailed: options.onFailed,
    })
  );
}

async function handleFinalizeSession(
  req: Request,
  res: Response,
  config: AuthboundConfig,
  options: HandlersOptions,
  client: AuthboundClient
): Promise<void> {
  const getUserRef = options.getUserRef;
  await sendKernelResponse(
    res,
    config,
    await finalizeSessionHandlerKernel({
      request: sessionOriginRequest(req),
      requestBody: req.body ?? null,
      pendingVerification: await getPendingVerificationFromCookie(req, config),
      config,
      client,
      getUserRef: getUserRef ? () => getUserRef(req) : undefined,
    })
  );
}

async function handleGetStatus(
  req: Request,
  res: Response,
  config: AuthboundConfig
): Promise<void> {
  await sendKernelResponse(
    res,
    config,
    await getStatusHandlerKernel({
      config,
      getVerification: () => getVerificationFromCookie(req, config),
    })
  );
}

async function handleSignOut(
  _req: Request,
  res: Response,
  config: AuthboundConfig
): Promise<void> {
  await sendKernelResponse(res, config, await signOutHandlerKernel({ config }));
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
