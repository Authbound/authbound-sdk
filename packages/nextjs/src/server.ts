/**
 * @authbound-sdk/nextjs/server
 *
 * Server-side utilities for Next.js App Router.
 *
 * @example
 * ```ts
 * // app/api/authbound/session/route.ts
 * import { createSessionRoute } from '@authbound-sdk/nextjs/server';
 *
 * export const POST = createSessionRoute({
 *   policyId: 'age-gate-18@1.0.0',
 * });
 * ```
 */

import type { PolicyId } from "@authbound-sdk/core";
import { type NextRequest, NextResponse } from "next/server";
import { verifyWebhookSignatureDetailed } from "@authbound-sdk/server";

// ============================================================================
// Types
// ============================================================================

export interface SessionRouteOptions {
  /**
   * Policy ID for the verification session.
   */
  policyId: PolicyId;

  /**
   * Custom session endpoint on Authbound gateway.
   * @default Uses AUTHBOUND_GATEWAY_URL env var
   */
  gatewayUrl?: string;

  /**
   * Secret key for signing.
   * @default Uses AUTHBOUND_SECRET env var
   */
  secret?: string;

  /**
   * Enable debug logging.
   * @default false
   */
  debug?: boolean;

  /**
   * Custom request transformer.
   * Allows adding metadata or modifying the request before sending to gateway.
   */
  transformRequest?: (
    request: NextRequest,
    body: Record<string, unknown>
  ) => Record<string, unknown> | Promise<Record<string, unknown>>;

  /**
   * Custom response transformer.
   * Allows modifying the response before returning to client.
   */
  transformResponse?: (
    response: Record<string, unknown>
  ) => Record<string, unknown> | Promise<Record<string, unknown>>;
}

export interface WebhookRouteOptions {
  /**
   * Webhook secret for signature verification.
   * @default Uses AUTHBOUND_WEBHOOK_SECRET env var
   */
  webhookSecret?: string;

  /**
   * Handler for verified sessions.
   */
  onVerified?: (event: WebhookEvent) => void | Promise<void>;

  /**
   * Handler for failed sessions.
   */
  onFailed?: (event: WebhookEvent) => void | Promise<void>;

  /**
   * Handler for all webhook events.
   */
  onEvent?: (event: WebhookEvent) => void | Promise<void>;

  /**
   * Maximum age of a webhook event in seconds.
   * Events older than this will be rejected to prevent replay attacks.
   * @default 300 (5 minutes)
   */
  tolerance?: number;

  /**
   * Enable debug logging.
   * @default false
   */
  debug?: boolean;
}

interface WebhookEvent {
  id: string;
  type: string;
  created: number;
  data: {
    object: {
      id: string;
      status: string;
      verified_outputs?: Record<string, unknown>;
      last_error?: { code: string; message: string };
    };
  };
}

// ============================================================================
// Environment Helpers
// ============================================================================

function getEnvVar(name: string, fallback?: string): string {
  const value = process.env[name];
  if (!(value || fallback)) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value ?? fallback!;
}

// ============================================================================
// Webhook Signature Verification (re-exported from @authbound-sdk/server)
// ============================================================================

export {
  verifyWebhookSignature,
  verifyWebhookSignatureDetailed,
  generateWebhookSignature,
  type WebhookSignatureOptions,
  type WebhookSignatureResult,
} from "@authbound-sdk/server";

// ============================================================================
// Gateway Response Mapping
// ============================================================================

/**
 * Map gateway response fields to SDK-expected shape.
 *
 * Gateway returns snake_case REST conventions:
 *   { id, client_token, client_action: { data }, verification_url, expires_at }
 *
 * SDK expects camelCase with semantic names:
 *   { sessionId, clientToken, authorizationRequestUrl, expiresAt, deepLink }
 */
function mapGatewayResponse(raw: Record<string, unknown>): Record<string, unknown> {
  // If already mapped (has sessionId), pass through
  if (raw.sessionId) return raw;

  const clientAction = raw.client_action as
    | { kind?: string; data?: string; expires_at?: string }
    | undefined;

  return {
    sessionId: `ses_${raw.id}`,
    authorizationRequestUrl: clientAction?.data ?? raw.verification_url,
    clientToken: raw.client_token,
    expiresAt: raw.expires_at,
    deepLink: clientAction?.data,
  };
}

// ============================================================================
// Session Route Handler
// ============================================================================

/**
 * Create a zero-config session route handler.
 *
 * This handler creates verification sessions by proxying requests to the
 * Authbound gateway. It handles authentication and adds your policy ID.
 *
 * @example
 * ```ts
 * // app/api/authbound/session/route.ts
 * import { createSessionRoute } from '@authbound-sdk/nextjs/server';
 *
 * export const POST = createSessionRoute({
 *   policyId: 'age-gate-18@1.0.0',
 * });
 * ```
 *
 * @example
 * ```ts
 * // With custom metadata
 * export const POST = createSessionRoute({
 *   policyId: 'kyc-full@1.0.0',
 *   transformRequest: async (request, body) => {
 *     const user = await getCurrentUser();
 *     return {
 *       ...body,
 *       metadata: { userId: user.id },
 *     };
 *   },
 * });
 * ```
 */
export function createSessionRoute(
  options: SessionRouteOptions
): (request: NextRequest) => Promise<NextResponse> {
  const {
    policyId,
    gatewayUrl = getEnvVar(
      "AUTHBOUND_GATEWAY_URL",
      "https://gateway.authbound.io"
    ),
    secret = getEnvVar("AUTHBOUND_SECRET"),
    debug = false,
    transformRequest,
    transformResponse,
  } = options;

  return async (request: NextRequest): Promise<NextResponse> => {
    try {
      // Parse request body
      let body: Record<string, unknown> = {};
      try {
        body = await request.json();
      } catch {
        // Empty body is fine
      }

      // Add policy ID
      body.policyId = policyId;

      // Transform request if provided
      if (transformRequest) {
        body = await transformRequest(request, body);
      }

      if (debug) {
        console.log("[Authbound] Creating session:", { policyId, body });
      }

      // Proxy to gateway
      const gatewayResponse = await fetch(`${gatewayUrl}/v1/verifications`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${secret}`,
        },
        body: JSON.stringify(body),
      });

      if (!gatewayResponse.ok) {
        const errorBody = await gatewayResponse.json().catch(() => ({}));
        if (debug) {
          console.error("[Authbound] Gateway error:", errorBody);
        }
        return NextResponse.json(
          {
            error: errorBody.message ?? "Failed to create session",
            code: errorBody.code,
            message: errorBody.message,
          },
          { status: gatewayResponse.status }
        );
      }

      const rawResponse = await gatewayResponse.json();

      // Map gateway response shape to SDK-expected shape
      let responseData = mapGatewayResponse(rawResponse);

      // Apply custom transform on top of mapped response
      if (transformResponse) {
        responseData = await transformResponse(responseData);
      }

      if (debug) {
        console.log("[Authbound] Session created:", responseData);
      }

      return NextResponse.json(responseData);
    } catch (error) {
      if (debug) {
        console.error("[Authbound] Session creation error:", error);
      }
      return NextResponse.json(
        { error: "Internal server error" },
        { status: 500 }
      );
    }
  };
}

// ============================================================================
// Webhook Route Handler
// ============================================================================

/**
 * Create a webhook route handler for Authbound events.
 *
 * @example
 * ```ts
 * // app/api/authbound/webhook/route.ts
 * import { createWebhookRoute } from '@authbound-sdk/nextjs/server';
 *
 * export const POST = createWebhookRoute({
 *   onVerified: async (event) => {
 *     const { id, verified_outputs } = event.data.object;
 *     await db.users.update({
 *       where: { sessionId: id },
 *       data: { verified: true, age: verified_outputs?.age },
 *     });
 *   },
 * });
 * ```
 */
export function createWebhookRoute(
  options: WebhookRouteOptions
): (request: NextRequest) => Promise<NextResponse> {
  const {
    webhookSecret = process.env.AUTHBOUND_WEBHOOK_SECRET,
    onVerified,
    onFailed,
    onEvent,
    tolerance = 300, // 5 minutes
    debug = false,
  } = options;

  return async (request: NextRequest): Promise<NextResponse> => {
    try {
      // Get the raw body for signature verification
      const rawBody = await request.text();

      // Verify signature if webhook secret is provided
      if (webhookSecret) {
        const signature = request.headers.get("x-authbound-signature");
        if (!signature) {
          if (debug) {
            console.error("[Authbound] Webhook missing signature header");
          }
          return NextResponse.json(
            { error: "Missing signature" },
            { status: 401 }
          );
        }

        // Verify HMAC signature with timestamp tolerance
        const verification = verifyWebhookSignatureDetailed({
          payload: rawBody,
          signature,
          secret: webhookSecret,
          tolerance,
        });
        if (!verification.valid) {
          if (debug) {
            console.error(
              "[Authbound] Webhook signature verification failed:",
              verification.error
            );
          }
          return NextResponse.json(
            { error: verification.error || "Invalid signature" },
            { status: 401 }
          );
        }
      } else if (debug) {
        console.warn(
          "[Authbound] No webhook secret configured. " +
            "Set AUTHBOUND_WEBHOOK_SECRET to enable signature verification."
        );
      }

      // Parse the body (we already have it as text from signature verification)
      const event = JSON.parse(rawBody) as WebhookEvent;

      if (debug) {
        console.log("[Authbound] Webhook event:", event);
      }

      // Call event handler
      if (onEvent) {
        await onEvent(event);
      }

      // Call specific handlers
      switch (event.type) {
        case "identity.verification_session.verified":
          if (onVerified) {
            await onVerified(event);
          }
          break;
        case "identity.verification_session.failed":
          if (onFailed) {
            await onFailed(event);
          }
          break;
      }

      return NextResponse.json({ received: true });
    } catch (error) {
      if (debug) {
        console.error("[Authbound] Webhook error:", error);
      }
      return NextResponse.json(
        { error: "Webhook processing failed" },
        { status: 500 }
      );
    }
  };
}

// ============================================================================
// Status Route Handler
// ============================================================================

export interface StatusRouteOptions {
  /**
   * Gateway URL.
   * @default Uses AUTHBOUND_GATEWAY_URL env var
   */
  gatewayUrl?: string;

  /**
   * Enable debug logging.
   */
  debug?: boolean;
}

/**
 * Create a status polling route handler.
 *
 * Forwards the client token from the incoming request's Authorization header
 * to the gateway, preserving the principle of least privilege.
 *
 * @example
 * ```ts
 * // app/api/authbound/status/[sessionId]/route.ts
 * import { createStatusRoute } from '@authbound-sdk/nextjs/server';
 *
 * export const GET = createStatusRoute();
 * ```
 */
export function createStatusRoute(
  options: StatusRouteOptions = {}
): (
  request: NextRequest,
  context: { params: { sessionId: string } | Promise<{ sessionId: string }> }
) => Promise<NextResponse> {
  const {
    gatewayUrl = getEnvVar(
      "AUTHBOUND_GATEWAY_URL",
      "https://gateway.authbound.io"
    ),
    debug = false,
  } = options;

  return async (
    request: NextRequest,
    context: { params: { sessionId: string } | Promise<{ sessionId: string }> }
  ): Promise<NextResponse> => {
    try {
      // Handle both sync and async params (Next.js 15)
      const params = await context.params;
      const { sessionId } = params;

      if (!sessionId) {
        return NextResponse.json(
          { error: "Missing sessionId" },
          { status: 400 }
        );
      }

      // Forward the client token from the incoming request
      const authorization = request.headers.get("Authorization");
      if (!authorization) {
        return NextResponse.json(
          { error: "Missing Authorization header" },
          { status: 401 }
        );
      }

      // Strip ses_ prefix if present (gateway expects raw UUID)
      const rawId = sessionId.startsWith("ses_") ? sessionId.slice(4) : sessionId;

      if (debug) {
        console.log("[Authbound] Checking status:", rawId);
      }

      const response = await fetch(`${gatewayUrl}/v1/verifications/${rawId}/status`, {
        headers: {
          Authorization: authorization,
        },
      });

      if (!response.ok) {
        return NextResponse.json(
          { error: "Failed to get status" },
          { status: response.status }
        );
      }

      const data = await response.json();
      return NextResponse.json(data);
    } catch (error) {
      if (debug) {
        console.error("[Authbound] Status error:", error);
      }
      return NextResponse.json(
        { error: "Internal server error" },
        { status: 500 }
      );
    }
  };
}

// ============================================================================
// Server Utilities
// ============================================================================

/**
 * Create a session on the server side.
 * Useful for server components or server actions.
 *
 * @example
 * ```ts
 * // In a server action
 * import { createSession } from '@authbound-sdk/nextjs/server';
 *
 * export async function startVerification() {
 *   'use server';
 *   const session = await createSession({
 *     policyId: 'age-gate-18@1.0.0',
 *     metadata: { userId: user.id },
 *   });
 *   return session;
 * }
 * ```
 */
export async function createSession(options: {
  policyId: PolicyId;
  gatewayUrl?: string;
  secret?: string;
  customerUserRef?: string;
  metadata?: Record<string, string>;
}): Promise<{
  sessionId: string;
  authorizationRequestUrl: string;
  clientToken: string;
  expiresAt: string;
}> {
  const {
    policyId,
    gatewayUrl = getEnvVar(
      "AUTHBOUND_GATEWAY_URL",
      "https://gateway.authbound.io"
    ),
    secret = getEnvVar("AUTHBOUND_SECRET"),
    customerUserRef,
    metadata,
  } = options;

  const response = await fetch(`${gatewayUrl}/v1/verifications`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${secret}`,
    },
    body: JSON.stringify({
      policyId,
      customerUserRef,
      metadata,
    }),
  });

  if (!response.ok) {
    throw new Error(`Failed to create session: ${response.statusText}`);
  }

  const raw = await response.json();
  return mapGatewayResponse(raw) as {
    sessionId: string;
    authorizationRequestUrl: string;
    clientToken: string;
    expiresAt: string;
  };
}

// ============================================================================
// Re-exports from @authbound-sdk/server
// ============================================================================

export {
  type AuthboundClaims,
  // Core types
  type AuthboundConfig,
  type AuthboundSession,
  type CookieOptions,
  calculateAge,
  checkRequirements,
  // JWT
  createToken,
  getSessionFromToken,
  type ProtectedRouteConfig,
  // Utilities
  parseConfig,
  type RoutesConfig,
  type VerificationRequirements,
  type VerificationStatus,
  verifyToken,
} from "@authbound-sdk/server";

export {
  clearSessionCookie,
  // Next.js specific
  createAuthboundHandlers,
  createSessionHandler,
  createSignOutHandler,
  createStatusHandler,
  createWebhookHandler,
  // Cookies
  getCookieName,
  getCookieValue,
  getSessionFromCookie,
  setSessionCookie,
} from "@authbound-sdk/server/next";
