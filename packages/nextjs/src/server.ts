/**
 * @authbound/nextjs/server
 *
 * Server-side utilities for Next.js App Router.
 *
 * @example
 * ```ts
 * // app/api/authbound/session/route.ts
 * import { createSessionRoute } from '@authbound/nextjs/server';
 *
 * export const POST = createSessionRoute({
 *   policyId: 'age-gate-18@1.0.0',
 * });
 * ```
 */

import { NextRequest, NextResponse } from "next/server";
import type { PolicyId } from "@authbound/core";
import crypto from "crypto";

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
  if (!value && !fallback) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value ?? fallback!;
}

// ============================================================================
// Webhook Signature Verification
// ============================================================================

/**
 * Parse the Authbound webhook signature header.
 * Format: "t=<timestamp>,v1=<signature>"
 */
function parseSignatureHeader(header: string): { timestamp: number; signatures: string[] } | null {
  const parts = header.split(",");
  let timestamp = 0;
  const signatures: string[] = [];

  for (const part of parts) {
    const [key, value] = part.split("=");
    if (key === "t") {
      timestamp = parseInt(value, 10);
      if (isNaN(timestamp)) {
        return null;
      }
    } else if (key === "v1") {
      signatures.push(value);
    }
  }

  if (timestamp === 0 || signatures.length === 0) {
    return null;
  }

  return { timestamp, signatures };
}

/**
 * Compute the expected signature for a webhook payload.
 * Uses HMAC-SHA256 with format: "timestamp.payload"
 */
function computeSignature(payload: string, timestamp: number, secret: string): string {
  const signedPayload = `${timestamp}.${payload}`;
  return crypto.createHmac("sha256", secret).update(signedPayload).digest("hex");
}

/**
 * Compare signatures in constant time to prevent timing attacks.
 */
function secureCompare(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;
  }
  return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

/**
 * Verify a webhook signature.
 * Returns true if the signature is valid and the timestamp is within tolerance.
 */
export function verifyWebhookSignature(
  payload: string,
  signatureHeader: string,
  secret: string,
  tolerance = 300 // 5 minutes default
): { isValid: boolean; error?: string } {
  const parsed = parseSignatureHeader(signatureHeader);

  if (!parsed) {
    return { isValid: false, error: "Invalid signature header format" };
  }

  const { timestamp, signatures } = parsed;

  // Check timestamp tolerance (both past AND future to prevent replay attacks)
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - timestamp) > tolerance) {
    return { isValid: false, error: "Timestamp outside tolerance window (possible replay attack)" };
  }

  // Compute expected signature
  const expected = computeSignature(payload, timestamp, secret);

  // Check if any of the provided signatures match
  const isValid = signatures.some((sig) => secureCompare(expected, sig));

  if (!isValid) {
    return { isValid: false, error: "Signature mismatch" };
  }

  return { isValid: true };
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
 * import { createSessionRoute } from '@authbound/nextjs/server';
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
    gatewayUrl = getEnvVar("AUTHBOUND_GATEWAY_URL", "https://gateway.authbound.io"),
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
      const gatewayResponse = await fetch(`${gatewayUrl}/v1/sessions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${secret}`,
        },
        body: JSON.stringify(body),
      });

      if (!gatewayResponse.ok) {
        const error = await gatewayResponse.text();
        if (debug) {
          console.error("[Authbound] Gateway error:", error);
        }
        return NextResponse.json(
          { error: "Failed to create session" },
          { status: gatewayResponse.status }
        );
      }

      let responseData = await gatewayResponse.json();

      // Transform response if provided
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
 * import { createWebhookRoute } from '@authbound/nextjs/server';
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
        const verification = verifyWebhookSignature(rawBody, signature, webhookSecret, tolerance);
        if (!verification.isValid) {
          if (debug) {
            console.error("[Authbound] Webhook signature verification failed:", verification.error);
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
   * Secret key.
   * @default Uses AUTHBOUND_SECRET env var
   */
  secret?: string;

  /**
   * Enable debug logging.
   */
  debug?: boolean;
}

/**
 * Create a status polling route handler.
 *
 * @example
 * ```ts
 * // app/api/authbound/status/[sessionId]/route.ts
 * import { createStatusRoute } from '@authbound/nextjs/server';
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
    gatewayUrl = getEnvVar("AUTHBOUND_GATEWAY_URL", "https://gateway.authbound.io"),
    secret = getEnvVar("AUTHBOUND_SECRET"),
    debug = false,
  } = options;

  return async (
    _request: NextRequest,
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

      if (debug) {
        console.log("[Authbound] Checking status:", sessionId);
      }

      const response = await fetch(`${gatewayUrl}/v1/sessions/${sessionId}`, {
        headers: {
          Authorization: `Bearer ${secret}`,
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
 * import { createSession } from '@authbound/nextjs/server';
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
    gatewayUrl = getEnvVar("AUTHBOUND_GATEWAY_URL", "https://gateway.authbound.io"),
    secret = getEnvVar("AUTHBOUND_SECRET"),
    customerUserRef,
    metadata,
  } = options;

  const response = await fetch(`${gatewayUrl}/v1/sessions`, {
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

  return response.json();
}

// ============================================================================
// Re-exports from @authbound/server
// ============================================================================

export {
  // Core types
  type AuthboundConfig,
  type AuthboundClaims,
  type AuthboundSession,
  type ProtectedRouteConfig,
  type VerificationRequirements,
  type RoutesConfig,
  type CookieOptions,
  type VerificationStatus,
  // Utilities
  parseConfig,
  checkRequirements,
  calculateAge,
  // JWT
  createToken,
  verifyToken,
  getSessionFromToken,
} from "@authbound/server";

export {
  // Next.js specific
  createAuthboundHandlers,
  createSessionHandler,
  createWebhookHandler,
  createStatusHandler,
  createSignOutHandler,
  // Cookies
  getCookieName,
  getCookieValue,
  getSessionFromCookie,
  setSessionCookie,
  clearSessionCookie,
} from "@authbound/server/next";
