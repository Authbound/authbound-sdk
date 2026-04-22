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
  createErrorResponse,
  createJsonResponse,
  type CookieReadableRequest,
  getVerificationFromCookie,
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
   * - event.type: The event type (e.g., "identity.verification_session.verified")
   * - event.data.object: The verification event object with status and verified_outputs
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
   * By default, no signature validation is performed.
   *
   * Use the Authbound-Signature header to verify the webhook:
   * Format: "t=<timestamp>,v1=<signature>"
   */
  validateWebhookSignature?: (
    request: Request,
    event: WebhookEvent
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
  customer_user_ref: z.string().optional(),
  callback_url: z.string().url().optional(),
  policy_id: z.string().optional(),
});

// ============================================================================
// Path Detection
// ============================================================================

type RouteAction =
  | "verification"
  | "callback"
  | "status"
  | "signout"
  | "unknown";

function detectRouteAction(request: Request): RouteAction {
  const { pathname, searchParams } = new URL(request.url);
  const method = request.method;

  // Check for explicit action query param
  const action = searchParams.get("action");
  if (action === "callback") return "callback";
  if (action === "status") return "status";
  if (action === "verification") return "verification";

  // Infer from path segments
  const segments = pathname.split("/").filter(Boolean);
  const lastSegment = segments[segments.length - 1];

  if (lastSegment === "callback" || pathname.includes("/callback")) {
    return "callback";
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
 * import { createAuthboundHandlers } from '@authbound-sdk/server/next';
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
      "https://api.authbound.com",
    debug: validatedConfig.debug,
  });

  // ============================================================================
  // POST Handler
  // ============================================================================

  const POST = async (request: Request): Promise<Response> => {
    const action = detectRouteAction(request);

    // Handle webhook callback
    if (action === "callback") {
      return handleWebhook(request, validatedConfig, options);
    }

    // Handle verification creation
    return handleCreateVerification(request, validatedConfig, options, client);
  };

  // ============================================================================
  // GET Handler
  // ============================================================================

  const GET = async (request: Request): Promise<Response> => {
    return handleGetStatus(request, validatedConfig);
  };

  // ============================================================================
  // DELETE Handler
  // ============================================================================

  const DELETE = async (request: Request): Promise<Response> => {
    return handleSignOut(request, validatedConfig);
  };

  return { GET, POST, DELETE };
}

// ============================================================================
// Handler Implementations
// ============================================================================

async function handleCreateVerification(
  request: Request,
  config: AuthboundConfig,
  options: HandlersOptions,
  client: AuthboundClient
): Promise<Response> {
  try {
    // Parse request body
    let body: z.infer<typeof CreateVerificationRequestSchema> = {};
    try {
      const rawBody = await request.json();
      body = CreateVerificationRequestSchema.parse(rawBody);
    } catch {
      // Body might be empty or invalid - use defaults
    }

    // Get user ref from custom handler or generate one
    const userRef =
      body.customer_user_ref ??
      (options.getUserRef
        ? await options.getUserRef(request)
        : `user_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`);

    // Build callback URL if configured
    const callbackUrl =
      body.callback_url ??
      (config.routes.callback
        ? new URL(config.routes.callback, request.url).toString()
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

    return createJsonResponse(verificationResponse);
  } catch (error) {
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

async function handleWebhook(
  request: Request,
  config: AuthboundConfig,
  options: HandlersOptions
): Promise<Response> {
  try {
    const rawBody = await request.json();
    const parsed = WebhookEventSchema.safeParse(rawBody);

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

    // Validate signature if handler provided
    if (options.validateWebhookSignature) {
      const isValid = await options.validateWebhookSignature(request, event);
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
    }

    // Call custom webhook handler
    if (options.onWebhook) {
      await options.onWebhook(event);
    }

    // Calculate age from DOB if available
    let age: number | undefined;
    if (verification.verified_outputs?.dob) {
      try {
        age = calculateAgeFromDob(verification.verified_outputs.dob);
      } catch (error) {
        // Log invalid DOB but don't fail the webhook
        logError(error, "Age calculation from DOB", config.debug);
        // age remains undefined
      }
    }

    // Format DOB as ISO string for the verification cookie.
    const dateOfBirth = verification.verified_outputs?.dob
      ? `${verification.verified_outputs.dob.year}-${String(verification.verified_outputs.dob.month).padStart(2, "0")}-${String(verification.verified_outputs.dob.day).padStart(2, "0")}`
      : undefined;

    // Create response with verification cookie.
    const response = createJsonResponse({ success: true });

    await setVerificationCookie(response, config, {
      userRef: verification.client_reference_id,
      verificationId: verification.id,
      status: mapVerificationEventStatusToVerificationStatus(
        verification.status
      ),
      assuranceLevel: "SUBSTANTIAL",
      age,
      dateOfBirth,
    });

    if (config.debug) {
      console.log("[Authbound] Webhook processed:", {
        eventId: event.id,
        eventType: event.type,
        verificationId: verification.id,
        status: verification.status,
      });
    }

    return response;
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
  request: Request,
  config: AuthboundConfig
): Promise<Response> {
  try {
    const response = createJsonResponse({ success: true });
    clearVerificationCookie(response, config);

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
      "https://api.authbound.com",
    debug: validatedConfig.debug,
  });

  return (request: Request) =>
    handleCreateVerification(request, validatedConfig, options, client);
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
