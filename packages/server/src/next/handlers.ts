import {
  isSameOriginSessionRequest,
  ProviderPreferenceSchema,
} from "@authbound/core";
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
  WebhookEventType,
} from "../core/types";
import { parseConfig, WebhookEventSchema } from "../core/types";
import { verifyWebhookSignatureDetailed } from "../core/webhooks";
import {
  type CookieReadableRequest,
  clearPendingVerificationCookie,
  clearVerificationCookie,
  createErrorResponse,
  createJsonResponse,
  getPendingVerificationFromCookie,
  getVerificationFromCookie,
  setPendingVerificationCookie,
  setVerificationCookie,
} from "./cookies";

// ============================================================================
// Types
// ============================================================================

export interface AuthboundHandlers {
  /** POST handler for creating verifications and handling webhooks */
  POST: (request: Request) => Promise<Response>;
  /** GET handler for checking verification status */
  GET: (request: Request) => Promise<Response>;
  /** DELETE handler for signing out */
  DELETE: (request: Request) => Promise<Response>;
}

export interface HandlersOptions {
  /**
   * Custom handler called when a webhook event is received.
   * Use this to sync verification status with your database.
   *
   * The event uses a nested structure:
   * - event.type: The event type (e.g., "verification.completed")
   * - event.data.object: The verification event object with status and verified_outputs
   */
  onWebhook?: (event: WebhookEvent) => void | Promise<void>;

  /**
   * Custom handler called when a verified webhook event is received.
   */
  onVerified?: (event: WebhookEvent) => void | Promise<void>;

  /**
   * Custom handler called when a failed webhook event is received.
   */
  onFailed?: (event: WebhookEvent) => void | Promise<void>;

  /**
   * Custom handler called when a verification is created.
   */
  onVerificationCreated?: (
    response: CreateVerificationResponse
  ) => void | Promise<void>;

  /**
   * Custom handler to validate the webhook signature.
   * Return true if valid, false if invalid.
   * By default, Authbound verifies the raw body with `config.webhookSecret`.
   *
   * Use the Authbound-Signature header to verify the webhook:
   * Format: "t=<timestamp>,v1=<signature>"
   */
  validateWebhookSignature?: (
    request: Request,
    rawBody: string
  ) => boolean | Promise<boolean>;

  /**
   * Get the customer_user_ref for the current user.
   * Useful when integrating with existing auth systems.
   * By default, generates a unique ref based on timestamp.
   */
  getUserRef?: (request: Request) => string | Promise<string>;
}

// ============================================================================
// Request Schemas
// ============================================================================

const CreateVerificationRequestSchema = z.object({
  policyId: z.string().min(1),
  customerUserRef: z.string().optional(),
  metadata: z.record(z.string(), z.string()).optional(),
  provider: ProviderPreferenceSchema.optional(),
});

const FinalizeVerificationRequestSchema = z.object({
  verificationId: z.string().min(1),
  clientToken: z.string().min(1),
});

// ============================================================================
// Path Detection
// ============================================================================

type RouteAction =
  | "verification"
  | "webhook"
  | "session"
  | "status"
  | "signout"
  | "unknown";

function detectRouteAction(request: Request): RouteAction {
  const { pathname, searchParams } = new URL(request.url);
  const method = request.method;

  // Check for explicit action query param
  const action = searchParams.get("action");
  if (action === "callback" || action === "webhook") return "webhook";
  if (action === "session") return "session";
  if (action === "status") return "status";
  if (action === "verification") return "verification";

  // Infer from path segments
  const segments = pathname.split("/").filter(Boolean);
  const lastSegment = segments.at(-1);

  if (
    lastSegment === "callback" ||
    lastSegment === "webhook" ||
    pathname.includes("/callback") ||
    pathname.includes("/webhook")
  ) {
    return "webhook";
  }

  if (lastSegment === "session" || pathname.includes("/session")) {
    return "session";
  }

  if (lastSegment === "status" || pathname.includes("/status")) {
    return "status";
  }

  if (lastSegment === "signout" || pathname.includes("/signout")) {
    return "signout";
  }

  // Default based on method
  if (method === "DELETE") return "signout";
  if (method === "GET") return "status";
  if (method === "POST") return "verification";

  return "unknown";
}

// ============================================================================
// Handler Factory
// ============================================================================

/**
 * Create API route handlers for Authbound.
 *
 * @example
 * ```ts
 * // app/api/authbound/[...authbound]/route.ts
 * import { createAuthboundHandlers } from '@authbound/server/next';
 * import { authboundConfig } from '@/authbound.config';
 *
 * export const { GET, POST, DELETE } = createAuthboundHandlers(authboundConfig);
 * ```
 */
export function createAuthboundHandlers(
  config: AuthboundConfig,
  options: HandlersOptions = {}
): AuthboundHandlers {
  // Validate config at initialization
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

  // ============================================================================
  // POST Handler
  // ============================================================================

  const POST = async (request: Request): Promise<Response> => {
    const action = detectRouteAction(request);

    // Handle webhook callback
    if (action === "webhook") {
      return handleWebhook(request, validatedConfig, options);
    }

    if (action === "session") {
      return handleFinalizeSession(request, validatedConfig, options, client);
    }

    // Handle verification creation
    return handleCreateVerification(request, validatedConfig, options, client);
  };

  // ============================================================================
  // GET Handler
  // ============================================================================

  const GET = async (request: Request): Promise<Response> =>
    handleGetStatus(request, validatedConfig);

  // ============================================================================
  // DELETE Handler
  // ============================================================================

  const DELETE = async (request: Request): Promise<Response> =>
    handleSignOut(request, validatedConfig);

  return { GET, POST, DELETE };
}

// ============================================================================
// Handler Implementations
// ============================================================================

function getWebhookSecret(config: AuthboundConfig): string | undefined {
  return config.webhookSecret ?? process.env.AUTHBOUND_WEBHOOK_SECRET;
}

function isVerifiedWebhook(type: WebhookEventType): boolean {
  return type === "verification.completed";
}

function isFailedWebhook(type: WebhookEventType): boolean {
  return (
    type === "verification.failed" ||
    type === "verification.canceled" ||
    type === "verification.expired"
  );
}

async function handleCreateVerification(
  request: Request,
  config: AuthboundConfig,
  options: HandlersOptions,
  client: AuthboundClient
): Promise<Response> {
  try {
    // Parse request body
    let body: z.infer<typeof CreateVerificationRequestSchema>;
    try {
      const rawBody = await request.json();
      body = CreateVerificationRequestSchema.parse(rawBody);
    } catch {
      return createErrorResponse("Invalid request", 400, "INVALID_REQUEST");
    }

    // Get user ref from custom handler or generate one
    const userRef =
      body.customerUserRef ??
      (options.getUserRef
        ? await options.getUserRef(request)
        : `user_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`);

    const result = await client.verifications.create({
      policyId: body.policyId,
      customerUserRef: userRef,
      metadata: body.metadata,
      provider: body.provider,
      idempotencyKey: request.headers.get("idempotency-key") ?? undefined,
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

    const response = createJsonResponse(verificationResponse);
    await setPendingVerificationCookie(response, config, {
      userRef,
      verificationId: verificationResponse.verificationId,
    });

    return response;
  } catch (error) {
    if (error instanceof BrowserWalletUrlError) {
      return createErrorResponse(
        error.message,
        502,
        "BROWSER_WALLET_URL_MISSING"
      );
    }

    if (error instanceof BrowserVerificationResponseError) {
      return createErrorResponse(
        error.message,
        502,
        "INVALID_GATEWAY_RESPONSE"
      );
    }
    if (error instanceof AuthboundClientError) {
      logError(error, "Verification creation", config.debug);
      return createErrorResponse(
        error.message,
        error.statusCode ?? 500,
        error.code
      );
    }
    logError(error, "Verification creation", config.debug);
    const safeError = createSafeErrorResponse(error, 500, config.debug);
    return createErrorResponse(safeError.message, 500, safeError.code);
  }
}

async function handleFinalizeSession(
  request: Request,
  config: AuthboundConfig,
  options: HandlersOptions,
  client: AuthboundClient
): Promise<Response> {
  try {
    if (
      !isSameOriginSessionRequest(request, {
        allowedOrigins: config.allowedOrigins,
        trustProxy: config.trustProxy,
      })
    ) {
      return createErrorResponse(
        "Cross-origin session finalization is not allowed",
        403,
        "CROSS_ORIGIN_FORBIDDEN"
      );
    }

    const rawBody = await request.json().catch(() => null);
    const parsed = FinalizeVerificationRequestSchema.safeParse(rawBody);
    if (!parsed.success) {
      return createErrorResponse("Invalid request", 400, "INVALID_REQUEST");
    }

    const { verificationId } = parsed.data;
    const pendingVerification = await getPendingVerificationFromCookie(
      request as CookieReadableRequest,
      config
    );
    if (
      !pendingVerification ||
      pendingVerification.status !== "PENDING" ||
      pendingVerification.verificationId !== verificationId
    ) {
      return createErrorResponse(
        "Verification finalization is not bound to this browser session",
        403,
        "VERIFICATION_BINDING_REQUIRED"
      );
    }

    const userRef = options.getUserRef
      ? await options.getUserRef(request)
      : pendingVerification.userRef;
    if (userRef !== pendingVerification.userRef) {
      return createErrorResponse(
        "Verification finalization is not bound to the current user",
        403,
        "VERIFICATION_BINDING_REQUIRED"
      );
    }

    const result = await client.verifications.getResult(verificationId);
    const verifiedSession = toVerifiedSessionFinalization(result);
    if (!verifiedSession) {
      return createErrorResponse(
        "Verification is not verified",
        409,
        "VERIFICATION_NOT_VERIFIED"
      );
    }

    const response = createJsonResponse({
      isVerified: true,
      verificationId,
      status: verifiedSession.status,
    });

    await setVerificationCookie(response, config, {
      userRef,
      verificationId,
      status: "VERIFIED",
      assuranceLevel: "SUBSTANTIAL",
      age: verifiedSession.age,
      dateOfBirth: verifiedSession.dateOfBirth,
    });
    clearPendingVerificationCookie(response, config);

    return response;
  } catch (error) {
    if (error instanceof AuthboundClientError) {
      logError(error, "Session finalization", config.debug);
      return createErrorResponse(
        error.message,
        error.statusCode ?? 500,
        error.code
      );
    }
    logError(error, "Session finalization", config.debug);
    const safeError = createSafeErrorResponse(error, 500, config.debug);
    return createErrorResponse(safeError.message, 500, safeError.code);
  }
}

async function handleWebhook(
  request: Request,
  config: AuthboundConfig,
  options: HandlersOptions
): Promise<Response> {
  try {
    const rawBody = await request.text();

    if (options.validateWebhookSignature) {
      const isValid = await options.validateWebhookSignature(request, rawBody);
      if (!isValid) {
        logError(
          new Error("Invalid webhook signature"),
          "Webhook",
          config.debug
        );
        return createErrorResponse(
          "Invalid signature",
          401,
          "INVALID_SIGNATURE"
        );
      }
    } else if (!config.unsafeSkipWebhookSignatureVerification) {
      const webhookSecret = getWebhookSecret(config);
      if (!webhookSecret) {
        return createErrorResponse(
          "Webhook secret is required",
          500,
          "WEBHOOK_SECRET_MISSING"
        );
      }
      const signature = request.headers.get("x-authbound-signature");
      if (!signature) {
        return createErrorResponse(
          "Missing webhook signature",
          401,
          "INVALID_SIGNATURE"
        );
      }
      const verification = verifyWebhookSignatureDetailed({
        payload: rawBody,
        signature,
        secret: webhookSecret,
        tolerance: config.webhookTolerance,
      });
      if (!verification.valid) {
        return createErrorResponse(
          verification.error ?? "Invalid signature",
          401,
          "INVALID_SIGNATURE"
        );
      }
    }

    let eventBody: unknown;
    try {
      eventBody = JSON.parse(rawBody);
    } catch {
      return createErrorResponse(
        "Invalid JSON payload",
        400,
        "INVALID_PAYLOAD"
      );
    }

    const parsed = WebhookEventSchema.safeParse(eventBody);

    if (!parsed.success) {
      logError(
        new Error(`Invalid webhook event: ${parsed.error.message}`),
        "Webhook",
        config.debug
      );
      return createErrorResponse(
        "Invalid webhook event",
        400,
        "INVALID_PAYLOAD"
      );
    }

    const event = parsed.data;
    const verification = event.data.object;

    // Call custom webhook handler
    if (options.onWebhook) {
      await options.onWebhook(event);
    }

    if (isVerifiedWebhook(event.type) && options.onVerified) {
      await options.onVerified(event);
    }

    if (isFailedWebhook(event.type) && options.onFailed) {
      await options.onFailed(event);
    }

    if (config.debug) {
      console.log("[Authbound] Webhook processed:", {
        eventId: event.id,
        eventType: event.type,
        verificationId: verification.id,
        status: verification.status,
      });
    }

    return createJsonResponse({ received: true });
  } catch (error) {
    logError(error, "Webhook", config.debug);
    const safeError = createSafeErrorResponse(error, 500, config.debug);
    return createErrorResponse(safeError.message, 500, safeError.code);
  }
}

async function handleGetStatus(
  request: Request,
  config: AuthboundConfig
): Promise<Response> {
  try {
    const verification = await getVerificationFromCookie(
      request as CookieReadableRequest,
      config
    );

    const statusResponse: VerificationStatusResponse = {
      verification,
      isVerified: verification?.isVerified ?? false,
    };

    return createJsonResponse(statusResponse);
  } catch (error) {
    logError(error, "Status check", config.debug);
    const safeError = createSafeErrorResponse(error, 500, config.debug);
    return createErrorResponse(safeError.message, 500, safeError.code);
  }
}

async function handleSignOut(
  _request: Request,
  config: AuthboundConfig
): Promise<Response> {
  try {
    const response = createJsonResponse({ success: true });
    clearVerificationCookie(response, config);
    clearPendingVerificationCookie(response, config);

    if (config.debug) {
      console.log("[Authbound] Session cleared");
    }

    return response;
  } catch (error) {
    logError(error, "Sign out", config.debug);
    const safeError = createSafeErrorResponse(error, 500, config.debug);
    return createErrorResponse(safeError.message, 500, safeError.code);
  }
}

// ============================================================================
// Standalone Handlers (for custom routing)
// ============================================================================

/**
 * Create a standalone verification creation handler.
 */
export function createVerificationHandler(
  config: AuthboundConfig,
  options: HandlersOptions = {}
) {
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

  return (request: Request) =>
    handleCreateVerification(request, validatedConfig, options, client);
}

/**
 * Create a standalone browser session finalization handler.
 */
export function createSessionHandler(
  config: AuthboundConfig,
  options: HandlersOptions = {}
) {
  const validatedConfig = parseConfig(config);
  const client = new AuthboundClient({
    apiKey: validatedConfig.apiKey,
    apiUrl:
      validatedConfig.apiUrl ??
      process.env.AUTHBOUND_API_URL ??
      "https://api.authbound.io",
    debug: validatedConfig.debug,
  });

  return (request: Request) =>
    handleFinalizeSession(request, validatedConfig, options, client);
}

/**
 * Create a standalone webhook handler.
 */
export function createWebhookHandler(
  config: AuthboundConfig,
  options: HandlersOptions = {}
) {
  const validatedConfig = parseConfig(config);
  return (request: Request) => handleWebhook(request, validatedConfig, options);
}

/**
 * Create a standalone status handler.
 */
export function createStatusHandler(config: AuthboundConfig) {
  const validatedConfig = parseConfig(config);
  return (request: Request) => handleGetStatus(request, validatedConfig);
}

/**
 * Create a standalone sign-out handler.
 */
export function createSignOutHandler(config: AuthboundConfig) {
  const validatedConfig = parseConfig(config);
  return (request: Request) => handleSignOut(request, validatedConfig);
}
