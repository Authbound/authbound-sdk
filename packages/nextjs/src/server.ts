/**
 * @authbound/nextjs/server
 *
 * Server-side utilities for Next.js App Router.
 *
 * @example
 * ```ts
 * // app/api/authbound/verification/route.ts
 * import { createVerificationRoute } from '@authbound/nextjs/server';
 *
 * export const POST = createVerificationRoute({
 *   policyId: 'pol_authbound_pension_v1',
 * });
 * ```
 */

import type { PolicyId } from "@authbound/core";
import { verifyWebhookSignatureDetailed } from "@authbound/server";
import { NextResponse } from "next/server";

// ============================================================================
// Types
// ============================================================================

export interface VerificationRouteOptions {
  /**
   * Policy ID for the verification.
   */
  policyId: PolicyId;

  /**
   * Custom Authbound API URL.
   * @default Uses AUTHBOUND_API_URL env var
   */
  gatewayUrl?: string;

  /**
   * Authbound secret key.
   * @default Uses AUTHBOUND_SECRET_KEY env var
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
    request: Request,
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
   * Handler for verified events.
   */
  onVerified?: (event: WebhookEvent) => void | Promise<void>;

  /**
   * Handler for failed events.
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
  if (value) {
    return value;
  }
  if (fallback) {
    return fallback;
  }
  throw new Error(`Missing required environment variable: ${name}`);
}

function getSecretKey(fallback?: string): string {
  const value =
    process.env.AUTHBOUND_SECRET_KEY ??
    process.env.AUTHBOUND_SECRET ??
    fallback;
  if (!value) {
    throw new Error(
      "Missing required environment variable: AUTHBOUND_SECRET_KEY"
    );
  }
  return value;
}

function getPublishableKey(fallback?: string): string {
  const value =
    process.env.NEXT_PUBLIC_AUTHBOUND_PK ??
    process.env.AUTHBOUND_PUBLISHABLE_KEY ??
    fallback;
  if (!value) {
    throw new Error(
      "Missing required environment variable: NEXT_PUBLIC_AUTHBOUND_PK"
    );
  }
  return value;
}

function maskIdentifier(value: string | undefined): string | undefined {
  if (!value) {
    return;
  }

  if (value.length <= 8) {
    return "***";
  }

  return `${value.slice(0, 4)}...${value.slice(-4)}`;
}

function summarizeError(error: unknown): { name: string; message: string } {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
    };
  }

  return {
    name: "UnknownError",
    message: "Unknown error",
  };
}

function summarizeVerificationRequest(
  policyId: PolicyId,
  body: Record<string, unknown>
): Record<string, unknown> {
  const metadata =
    body.metadata &&
    typeof body.metadata === "object" &&
    !Array.isArray(body.metadata)
      ? (body.metadata as Record<string, unknown>)
      : null;

  return {
    policyId,
    bodyKeys: Object.keys(body).sort(),
    hasCustomerUserRef:
      typeof body.customerUserRef === "string" &&
      body.customerUserRef.length > 0,
    metadataKeys: metadata ? Object.keys(metadata).sort() : [],
  };
}

function summarizeGatewayError(errorBody: unknown): Record<string, unknown> {
  if (!errorBody || typeof errorBody !== "object") {
    return {
      type: typeof errorBody,
    };
  }

  const typedErrorBody = errorBody as Record<string, unknown>;

  return {
    code:
      typeof typedErrorBody.code === "string" ? typedErrorBody.code : undefined,
    message:
      typeof typedErrorBody.message === "string"
        ? typedErrorBody.message
        : undefined,
    object:
      typeof typedErrorBody.object === "string"
        ? typedErrorBody.object
        : undefined,
  };
}

function summarizeVerificationResponse(
  responseData: Record<string, unknown>
): Record<string, unknown> {
  return {
    verificationId:
      typeof responseData.verificationId === "string"
        ? maskIdentifier(responseData.verificationId)
        : undefined,
    expiresAt:
      typeof responseData.expiresAt === "string"
        ? responseData.expiresAt
        : undefined,
    hasAuthorizationRequestUrl:
      typeof responseData.authorizationRequestUrl === "string" &&
      responseData.authorizationRequestUrl.length > 0,
    hasClientToken:
      typeof responseData.clientToken === "string" &&
      responseData.clientToken.length > 0,
    hasDeepLink:
      typeof responseData.deepLink === "string" &&
      responseData.deepLink.length > 0,
  };
}

function summarizeWebhookEvent(event: WebhookEvent): Record<string, unknown> {
  return {
    eventId: maskIdentifier(event.id),
    type: event.type,
    created: event.created,
    verificationId: maskIdentifier(event.data.object.id),
    status: event.data.object.status,
    errorCode: event.data.object.last_error?.code,
  };
}

// ============================================================================
// Webhook Signature Verification (re-exported from @authbound/server)
// ============================================================================

export { asPolicyId } from "@authbound/core";
export {
  generateWebhookSignature,
  verifyWebhookSignature,
  verifyWebhookSignatureDetailed,
  type WebhookSignatureOptions,
  type WebhookSignatureResult,
} from "@authbound/server";

// ============================================================================
// Gateway Response Mapping
// ============================================================================

/**
 * Map gateway response fields to SDK-expected shape.
 *
 * Authbound returns snake_case REST conventions:
 *   { id, client_token, client_action: { kind, data }, verification_url, expires_at }
 *
 * SDK expects camelCase with semantic names:
 *   { verificationId, clientToken, authorizationRequestUrl, expiresAt, deepLink }
 */
class BrowserWalletUrlError extends Error {
  constructor() {
    super(
      "Authbound did not return a browser-compatible wallet URL for this verification."
    );
    this.name = "BrowserWalletUrlError";
  }
}

function getString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function mapGatewayResponse(
  raw: Record<string, unknown>
): Record<string, unknown> {
  const clientAction = (raw.client_action ?? raw.clientAction) as
    | { kind?: string; data?: string; expires_at?: string }
    | undefined;
  const linkAction =
    clientAction?.kind === "link" ? getString(clientAction.data) : undefined;
  const authorizationRequestUrl =
    getString(raw.authorizationRequestUrl) ??
    getString(raw.verification_url) ??
    linkAction;

  if (!authorizationRequestUrl) {
    throw new BrowserWalletUrlError();
  }

  return {
    verificationId: raw.verificationId ?? raw.id,
    authorizationRequestUrl,
    clientToken: raw.clientToken ?? raw.client_token,
    expiresAt: raw.expiresAt ?? raw.expires_at,
    deepLink: getString(raw.deepLink) ?? linkAction,
  };
}

// ============================================================================
// Verification Route Handler
// ============================================================================

/**
 * Create a zero-config verification route handler.
 *
 * This handler creates verifications by proxying requests to the
 * Authbound gateway. It handles authentication and adds your policy ID.
 *
 * @example
 * ```ts
 * // app/api/authbound/verification/route.ts
 * import { createVerificationRoute } from '@authbound/nextjs/server';
 *
 * export const POST = createVerificationRoute({
 *   policyId: 'pol_authbound_pension_v1',
 * });
 * ```
 *
 * @example
 * ```ts
 * // With custom metadata
 * export const POST = createVerificationRoute({
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
export function createVerificationRoute(
  options: VerificationRouteOptions
): (request: Request) => Promise<Response> {
  const {
    policyId,
    gatewayUrl = getEnvVar("AUTHBOUND_API_URL", "https://api.authbound.io"),
    secret = getSecretKey(),
    debug = false,
    transformRequest,
    transformResponse,
  } = options;

  return async (request: Request): Promise<Response> => {
    try {
      // Parse request body
      let body: Record<string, unknown> = {};
      try {
        body = await request.json();
      } catch {
        // Empty body is fine
      }

      // Transform request if provided
      if (transformRequest) {
        body = await transformRequest(request, body);
      }
      body.policyId = policyId;

      if (debug) {
        console.log(
          "[Authbound] Creating verification:",
          summarizeVerificationRequest(policyId, body)
        );
      }

      const gatewayBody = {
        customer_user_ref: body.customerUserRef,
        policy_id: body.policyId,
        metadata: body.metadata,
        provider: body.provider,
      };
      const idempotencyKey = request.headers.get("Idempotency-Key");
      const gatewayHeaders: Record<string, string> = {
        "Content-Type": "application/json",
        "X-Authbound-Key": secret,
      };
      if (idempotencyKey) {
        gatewayHeaders["Idempotency-Key"] = idempotencyKey;
      }

      // Proxy to gateway
      const gatewayResponse = await fetch(`${gatewayUrl}/v1/verifications`, {
        method: "POST",
        headers: gatewayHeaders,
        body: JSON.stringify(gatewayBody),
      });

      if (!gatewayResponse.ok) {
        const errorBody = await gatewayResponse.json().catch(() => ({}));
        if (debug) {
          console.error(
            "[Authbound] Gateway error:",
            summarizeGatewayError(errorBody)
          );
        }
        return NextResponse.json(
          {
            error: errorBody.message ?? "Failed to create verification",
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
        console.log(
          "[Authbound] Verification created:",
          summarizeVerificationResponse(responseData)
        );
      }

      return NextResponse.json(responseData);
    } catch (error) {
      if (error instanceof BrowserWalletUrlError) {
        return NextResponse.json(
          {
            error: error.message,
            code: "BROWSER_WALLET_URL_MISSING",
          },
          { status: 502 }
        );
      }

      if (debug) {
        console.error(
          "[Authbound] Verification creation error:",
          summarizeError(error)
        );
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
 *       where: { verificationId: id },
 *       data: { verified: true, age: verified_outputs?.age },
 *     });
 *   },
 * });
 * ```
 */
export function createWebhookRoute(
  options: WebhookRouteOptions
): (request: Request) => Promise<Response> {
  const {
    webhookSecret = process.env.AUTHBOUND_WEBHOOK_SECRET,
    onVerified,
    onFailed,
    onEvent,
    tolerance = 300, // 5 minutes
    debug = false,
  } = options;

  return async (request: Request): Promise<Response> => {
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
        console.log("[Authbound] Webhook event:", summarizeWebhookEvent(event));
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
        default:
          break;
      }

      return NextResponse.json({ received: true });
    } catch (error) {
      if (debug) {
        console.error("[Authbound] Webhook error:", summarizeError(error));
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
   * @default Uses AUTHBOUND_API_URL env var
   */
  gatewayUrl?: string;

  /**
   * Authbound publishable key used to scope client-token status requests.
   * @default Uses NEXT_PUBLIC_AUTHBOUND_PK or AUTHBOUND_PUBLISHABLE_KEY env var
   */
  publishableKey?: string;

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
 * // app/api/authbound/status/[verificationId]/route.ts
 * import { createStatusRoute } from '@authbound/nextjs/server';
 *
 * export const GET = createStatusRoute();
 * ```
 */
export function createStatusRoute(
  options: StatusRouteOptions = {}
): (
  request: Request,
  context: { params: Promise<{ verificationId: string }> }
) => Promise<Response> {
  const {
    gatewayUrl = getEnvVar("AUTHBOUND_API_URL", "https://api.authbound.io"),
    publishableKey: configuredPublishableKey,
    debug = false,
  } = options;

  return async (
    request: Request,
    context: { params: Promise<{ verificationId: string }> }
  ): Promise<Response> => {
    try {
      const params = await context.params;
      const { verificationId } = params;

      if (!verificationId) {
        return NextResponse.json(
          { error: "Missing verificationId" },
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

      if (debug) {
        console.log("[Authbound] Checking status:", {
          verificationId: maskIdentifier(verificationId),
        });
      }

      const publishableKey = getPublishableKey(configuredPublishableKey);

      const response = await fetch(
        `${gatewayUrl}/v1/verifications/${verificationId}/status`,
        {
          headers: {
            Authorization: authorization,
            "X-Authbound-Publishable-Key": publishableKey,
          },
        }
      );

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
        console.error("[Authbound] Status error:", summarizeError(error));
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
 * Create a verification on the server side.
 * Useful for server components or server actions.
 *
 * @example
 * ```ts
 * // In a server action
 * import { createVerification } from '@authbound/nextjs/server';
 *
 * export async function startVerification() {
 *   'use server';
 *   const verification = await createVerification({
 *     policyId: 'pol_authbound_pension_v1',
 *     metadata: { userId: user.id },
 *   });
 *   return verification;
 * }
 * ```
 */
export async function createVerification(options: {
  policyId: PolicyId;
  gatewayUrl?: string;
  secret?: string;
  customerUserRef?: string;
  metadata?: Record<string, string>;
}): Promise<{
  verificationId: string;
  authorizationRequestUrl: string;
  clientToken: string;
  expiresAt: string;
}> {
  const {
    policyId,
    gatewayUrl = getEnvVar("AUTHBOUND_API_URL", "https://api.authbound.io"),
    secret = getSecretKey(),
    customerUserRef,
    metadata,
  } = options;

  const response = await fetch(`${gatewayUrl}/v1/verifications`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Authbound-Key": secret,
    },
    body: JSON.stringify({
      policy_id: policyId,
      customer_user_ref: customerUserRef,
      metadata,
    }),
  });

  if (!response.ok) {
    throw new Error(`Failed to create verification: ${response.statusText}`);
  }

  const raw = await response.json();
  return mapGatewayResponse(raw) as {
    verificationId: string;
    authorizationRequestUrl: string;
    clientToken: string;
    expiresAt: string;
  };
}

// ============================================================================
// Re-exports from @authbound/server
// ============================================================================

export {
  type AuthboundClaims,
  // Core types
  type AuthboundConfig,
  type AuthboundVerificationContext,
  type CookieOptions,
  calculateAge,
  checkRequirements,
  // JWT
  createToken,
  getVerificationFromToken,
  type ProtectedRouteConfig,
  // Utilities
  parseConfig,
  type RoutesConfig,
  type VerificationRequirements,
  type VerificationStatus,
  verifyToken,
} from "@authbound/server";

export {
  clearVerificationCookie,
  // Next.js specific
  createAuthboundHandlers,
  createSignOutHandler,
  createStatusHandler,
  createVerificationHandler,
  createWebhookHandler,
  // Cookies
  getCookieName,
  getCookieValue,
  getVerificationFromCookie,
  setVerificationCookie,
} from "@authbound/server/next";
