import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import type {
  AuthboundConfig,
  CreateSessionResponse,
  SessionStatusResponse,
  WebhookPayload,
} from "../core/types";
import { WebhookPayloadSchema, calculateAge, parseConfig } from "../core/types";
import { logError, createSafeErrorResponse } from "../core/error-utils";
import {
  getSessionFromCookie,
  setSessionCookie,
  clearSessionCookie,
  createJsonResponse,
  createErrorResponse,
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
   * Custom handler called when a webhook is received.
   * Use this to sync verification status with your database.
   */
  onWebhook?: (payload: WebhookPayload) => void | Promise<void>;

  /**
   * Custom handler called when a session is created.
   */
  onSessionCreated?: (response: CreateSessionResponse) => void | Promise<void>;

  /**
   * Custom handler to validate the webhook signature.
   * Return true if valid, false if invalid.
   * By default, no signature validation is performed.
   */
  validateWebhookSignature?: (
    request: NextRequest,
    payload: WebhookPayload
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
// Upstream API Schemas
// ============================================================================

const UpstreamSessionResponseSchema = z.object({
  session_id: z.string(),
  client_token: z.string(),
  expires_at: z.string().optional(),
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
  const apiUrl =
    validatedConfig.apiUrl ??
    process.env.AUTHBOUND_API_URL ??
    "https://api.authbound.com";
  const apiKey = validatedConfig.apiKey;

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
    return handleCreateSession(
      request,
      validatedConfig,
      options,
      apiUrl,
      apiKey
    );
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
  apiUrl: string,
  apiKey: string
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

    // Call Authbound upstream API
    const upstreamResponse = await fetch(`${apiUrl}/sessions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Authbound-Key": apiKey,
      },
      body: JSON.stringify({
        customer_user_ref: userRef,
        ...(callbackUrl && { callback_url: callbackUrl }),
      }),
    });

    if (!upstreamResponse.ok) {
      const errorText = await upstreamResponse.text();
      logError(
        new Error(
          `Upstream API failed: ${upstreamResponse.status} - ${errorText}`
        ),
        "Session creation",
        config.debug
      );
      return createErrorResponse(
        "Failed to create verification session",
        502,
        "UPSTREAM_ERROR"
      );
    }

    const upstreamData = await upstreamResponse.json();
    const parsed = UpstreamSessionResponseSchema.safeParse(upstreamData);

    if (!parsed.success) {
      logError(
        new Error(`Invalid upstream response: ${parsed.error.message}`),
        "Session creation",
        config.debug
      );
      return createErrorResponse(
        "Invalid response from verification service",
        500,
        "INVALID_UPSTREAM_RESPONSE"
      );
    }

    const sessionResponse: CreateSessionResponse = {
      clientToken: parsed.data.client_token,
      sessionId: parsed.data.session_id,
      expiresAt: parsed.data.expires_at,
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
    const parsed = WebhookPayloadSchema.safeParse(rawBody);

    if (!parsed.success) {
      logError(
        new Error(`Invalid webhook payload: ${parsed.error.message}`),
        "Webhook",
        config.debug
      );
      return createErrorResponse(
        "Invalid webhook payload",
        400,
        "INVALID_PAYLOAD"
      );
    }

    const payload = parsed.data;

    // Validate signature if handler provided
    if (options.validateWebhookSignature) {
      const isValid = await options.validateWebhookSignature(request, payload);
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
      await options.onWebhook(payload);
    }

    // Calculate age from DOB if available
    const age = payload.document_data?.date_of_birth
      ? calculateAge(payload.document_data.date_of_birth)
      : undefined;

    // Create response with session cookie
    const response = createJsonResponse({ success: true });

    // Set the session cookie with verification data
    await setSessionCookie(response, config, {
      userRef: payload.customer_user_ref,
      sessionId: payload.session_id,
      status: payload.status,
      assuranceLevel: payload.assurance_level,
      age,
      dateOfBirth: payload.document_data?.date_of_birth,
    });

    if (config.debug) {
      console.log("[Authbound] Webhook processed:", {
        sessionId: payload.session_id,
        status: payload.status,
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
  const apiUrl = validatedConfig.apiUrl ?? "https://api.authbound.com";
  const apiKey = validatedConfig.apiKey;

  return (request: NextRequest) =>
    handleCreateSession(request, validatedConfig, options, apiUrl, apiKey);
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
