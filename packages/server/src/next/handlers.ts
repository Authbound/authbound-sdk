import type { NextRequest, NextResponse } from "next/server";
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
  createErrorResponse,
  createJsonResponse,
  getSessionFromCookie,
  setSessionCookie,
} from "./cookies";

// ============================================================================
// Types
// ============================================================================

export interface AuthboundHandlers {
  /** POST handler for creating sessions and handling webhooks */
  POST: (request: NextRequest) => Promise<NextResponse>;
  /** GET handler for checking session status */
  GET: (request: NextRequest) => Promise<NextResponse>;
  /** DELETE handler for signing out */
  DELETE: (request: NextRequest) => Promise<NextResponse>;
}

export interface HandlersOptions {
  /**
   * Custom handler called when a webhook event is received.
   * Use this to sync verification status with your database.
   *
   * The event uses a nested structure:
   * - event.type: The event type (e.g., "identity.verification_session.verified")
   * - event.data.object: The verification session object with status and verified_outputs
   */
  onWebhook?: (event: WebhookEvent) => void | Promise<void>;

  /**
   * Custom handler called when a session is created.
   */
  onSessionCreated?: (response: CreateSessionResponse) => void | Promise<void>;

  /**
   * Custom handler to validate the webhook signature.
   * Return true if valid, false if invalid.
   * By default, no signature validation is performed.
   *
   * Use the Authbound-Signature header to verify the webhook:
   * Format: "t=<timestamp>,v1=<signature>"
   */
  validateWebhookSignature?: (
    request: NextRequest,
    event: WebhookEvent
  ) => boolean | Promise<boolean>;

  /**
   * Get the customer_user_ref for the current user.
   * Useful when integrating with existing auth systems.
   * By default, generates a unique ref based on timestamp.
   */
  getUserRef?: (request: NextRequest) => string | Promise<string>;
}

// ============================================================================
// Request Schemas
// ============================================================================

const CreateSessionRequestSchema = z.object({
  customer_user_ref: z.string().optional(),
  callback_url: z.string().url().optional(),
});

// ============================================================================
// Path Detection
// ============================================================================

type RouteAction = "session" | "callback" | "status" | "signout" | "unknown";

function detectRouteAction(request: NextRequest): RouteAction {
  const { pathname, searchParams } = request.nextUrl;
  const method = request.method;

  // Check for explicit action query param
  const action = searchParams.get("action");
  if (action === "callback") return "callback";
  if (action === "status") return "status";
  if (action === "session") return "session";

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
  if (method === "POST") return "session";

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

  const POST = async (request: NextRequest): Promise<NextResponse> => {
    const action = detectRouteAction(request);

    // Handle webhook callback
    if (action === "callback") {
      return handleWebhook(request, validatedConfig, options);
    }

    // Handle session creation
    return handleCreateSession(request, validatedConfig, options, client);
  };

  // ============================================================================
  // GET Handler
  // ============================================================================

  const GET = async (request: NextRequest): Promise<NextResponse> => {
    return handleGetStatus(request, validatedConfig);
  };

  // ============================================================================
  // DELETE Handler
  // ============================================================================

  const DELETE = async (request: NextRequest): Promise<NextResponse> => {
    return handleSignOut(request, validatedConfig);
  };

  return { GET, POST, DELETE };
}

// ============================================================================
// Handler Implementations
// ============================================================================

async function handleCreateSession(
  request: NextRequest,
  config: AuthboundConfig,
  options: HandlersOptions,
  client: AuthboundClient
): Promise<NextResponse> {
  try {
    // Parse request body
    let body: z.infer<typeof CreateSessionRequestSchema> = {};
    try {
      const rawBody = await request.json();
      body = CreateSessionRequestSchema.parse(rawBody);
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

    return createJsonResponse(sessionResponse);
  } catch (error) {
    if (error instanceof AuthboundClientError) {
      logError(error, "Session creation", config.debug);
      return createErrorResponse(
        error.message,
        error.statusCode ?? 500,
        error.code
      );
    }
    logError(error, "Session creation", config.debug);
    const safeError = createSafeErrorResponse(error, 500, config.debug);
    return createErrorResponse(safeError.message, 500, safeError.code);
  }
}

async function handleWebhook(
  request: NextRequest,
  config: AuthboundConfig,
  options: HandlersOptions
): Promise<NextResponse> {
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
    const session = event.data.object;

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
    if (session.verified_outputs?.dob) {
      try {
        age = calculateAgeFromDob(session.verified_outputs.dob);
      } catch (error) {
        // Log invalid DOB but don't fail the webhook
        logError(error, "Age calculation from DOB", config.debug);
        // age remains undefined
      }
    }

    // Format DOB as ISO string for session cookie
    const dateOfBirth = session.verified_outputs?.dob
      ? `${session.verified_outputs.dob.year}-${String(session.verified_outputs.dob.month).padStart(2, "0")}-${String(session.verified_outputs.dob.day).padStart(2, "0")}`
      : undefined;

    // Create response with session cookie
    const response = createJsonResponse({ success: true });

    // Set the session cookie with verification data
    // Map the session status to our internal verification status
    await setSessionCookie(response, config, {
      userRef: session.client_reference_id,
      sessionId: session.id,
      status: mapSessionStatusToVerificationStatus(session.status),
      assuranceLevel: "SUBSTANTIAL", // Default assurance level for verified sessions
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

    return response;
  } catch (error) {
    logError(error, "Webhook", config.debug);
    const safeError = createSafeErrorResponse(error, 500, config.debug);
    return createErrorResponse(safeError.message, 500, safeError.code);
  }
}

async function handleGetStatus(
  request: NextRequest,
  config: AuthboundConfig
): Promise<NextResponse> {
  try {
    const session = await getSessionFromCookie(request, config);

    const statusResponse: SessionStatusResponse = {
      session,
      isVerified: session?.isVerified ?? false,
    };

    return createJsonResponse(statusResponse);
  } catch (error) {
    logError(error, "Status check", config.debug);
    const safeError = createSafeErrorResponse(error, 500, config.debug);
    return createErrorResponse(safeError.message, 500, safeError.code);
  }
}

async function handleSignOut(
  request: NextRequest,
  config: AuthboundConfig
): Promise<NextResponse> {
  try {
    const response = createJsonResponse({ success: true });
    clearSessionCookie(response, config);

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
 * Create a standalone session creation handler.
 */
export function createSessionHandler(
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

  return (request: NextRequest) =>
    handleCreateSession(request, validatedConfig, options, client);
}

/**
 * Create a standalone webhook handler.
 */
export function createWebhookHandler(
  config: AuthboundConfig,
  options: HandlersOptions = {}
) {
  const validatedConfig = parseConfig(config);
  return (request: NextRequest) =>
    handleWebhook(request, validatedConfig, options);
}

/**
 * Create a standalone status handler.
 */
export function createStatusHandler(config: AuthboundConfig) {
  const validatedConfig = parseConfig(config);
  return (request: NextRequest) => handleGetStatus(request, validatedConfig);
}

/**
 * Create a standalone sign-out handler.
 */
export function createSignOutHandler(config: AuthboundConfig) {
  const validatedConfig = parseConfig(config);
  return (request: NextRequest) => handleSignOut(request, validatedConfig);
}
