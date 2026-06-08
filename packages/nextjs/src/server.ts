/**
 * @authbound/nextjs/server
 *
 * Server-side utilities for Next.js App Router.
 *
 * @example
 * ```ts
 * // app/api/authbound/verification/route.ts
 * import { asPolicyId } from '@authbound/core';
 * import { createVerificationRoute } from '@authbound/nextjs/server';
 *
 * export const POST = createVerificationRoute({
 *   policyId: asPolicyId('pol_authbound_pension_v1'),
 * });
 * ```
 */

import {
  isSameOriginSessionRequest,
  originForStatusProxy,
  type PolicyId,
  PublicVerificationStatusSnapshotSchema,
  STATION_DISPLAY_TOKEN_HEADER,
  STATION_OPERATOR_GRANT_TOKEN_HEADER,
} from "@authbound/core";
import {
  AuthboundClient,
  AuthboundClientError,
  BrowserVerificationResponseError,
  BrowserWalletUrlError,
  type CreateVerificationResponse,
  createToken,
  getVerificationFromToken,
  redactSensitiveText,
  toBrowserVerificationResponse,
  toVerifiedSessionFinalization,
  verifyWebhookSignatureDetailed,
  type WebhookEvent,
  WebhookEventSchema,
} from "@authbound/server";
import { NextResponse } from "next/server.js";

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

  /**
   * Whether the SDK should create its browser session binding cookie.
   * @default "sdk"
   */
  sessionMode?: "sdk" | "manual";

  /**
   * Secret used to encrypt the local pending-verification cookie.
   * @default Uses AUTHBOUND_SESSION_SECRET env var
   */
  sessionSecret?: string;

  /**
   * Verification cookie name. The pending cookie uses `${cookieName}_pending`.
   * @default "__authbound"
   */
  cookieName?: string;

  /**
   * Pending verification cookie max age in seconds.
   * @default 600
   */
  pendingCookieMaxAge?: number;
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
   * Explicit test/demo escape hatch for unsigned webhooks. Never use in production.
   * @default false
   */
  unsafeSkipWebhookSignatureVerification?: boolean;

  /**
   * Enable debug logging.
   * @default false
   */
  debug?: boolean;
}

export interface StationRuntimeRouteOptions {
  /**
   * Custom Authbound API URL.
   * @default Uses AUTHBOUND_API_URL env var
   */
  gatewayUrl?: string;
}

export interface StationRuntimeRouteContext {
  params?:
    | Record<string, string | undefined>
    | Promise<Record<string, string | undefined>>;
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
  const value = process.env.AUTHBOUND_SECRET_KEY ?? fallback;
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
      name: redactSensitiveText(error.name),
      message: redactSensitiveText(error.message),
    };
  }

  return {
    name: "UnknownError",
    message: "Unknown error",
  };
}

function parseBrowserStatusSnapshot(data: Record<string, unknown>):
  | {
      ok: true;
      value: ReturnType<typeof PublicVerificationStatusSnapshotSchema.parse>;
    }
  | { ok: false; error: Error } {
  const parsed = PublicVerificationStatusSnapshotSchema.safeParse(data);
  if (!parsed.success) {
    return { ok: false, error: parsed.error };
  }

  return { ok: true, value: parsed.data };
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

function summarizeApiError(errorBody: unknown): Record<string, unknown> {
  if (!errorBody || typeof errorBody !== "object") {
    return {
      type: typeof errorBody,
    };
  }

  const typedErrorBody = errorBody as Record<string, unknown>;

  return {
    code:
      typeof typedErrorBody.code === "string"
        ? redactSensitiveText(typedErrorBody.code)
        : undefined,
    message:
      typeof typedErrorBody.message === "string"
        ? redactSensitiveText(typedErrorBody.message)
        : undefined,
    object:
      typeof typedErrorBody.object === "string"
        ? typedErrorBody.object
        : undefined,
  };
}

function apiErrorField(
  errorBody: unknown,
  field: "code" | "message"
): string | undefined {
  if (!errorBody || typeof errorBody !== "object") {
    return;
  }

  const value = (errorBody as Record<string, unknown>)[field];
  return typeof value === "string" ? redactSensitiveText(value) : undefined;
}

function stationRuntimeErrorBody(
  errorBody: unknown,
  fallback: string
): Record<string, unknown> {
  const message =
    apiErrorField(errorBody, "message") ??
    (errorBody && typeof errorBody === "object"
      ? typeof (errorBody as Record<string, unknown>).error === "string"
        ? redactSensitiveText(
            String((errorBody as Record<string, unknown>).error)
          )
        : undefined
      : undefined) ??
    redactSensitiveText(fallback || "Station runtime request failed");
  const code = apiErrorField(errorBody, "code");

  return {
    object: "error",
    error: message,
    message,
    ...(code ? { code } : {}),
  };
}

async function readJsonBody(
  request: Request
): Promise<Record<string, unknown>> {
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    return {};
  }
  const body = await request.json().catch(() => ({}));
  return body && typeof body === "object" && !Array.isArray(body)
    ? (body as Record<string, unknown>)
    : {};
}

async function stationRouteParam(
  context: StationRuntimeRouteContext | undefined,
  key: string
): Promise<string | undefined> {
  const params = context?.params ? await context.params : undefined;
  const value = params?.[key];
  return value && value.length > 0 ? value : undefined;
}

function stationToken(
  request: Request,
  body: Record<string, unknown>,
  ...keys: string[]
): string | undefined {
  const url = new URL(request.url);
  for (const key of keys) {
    const queryValue = url.searchParams.get(key);
    if (queryValue) {
      return queryValue;
    }
    const bodyValue = body[key];
    if (typeof bodyValue === "string" && bodyValue.length > 0) {
      return bodyValue;
    }
  }
  return;
}

async function forwardStationRuntimeRequest(
  gatewayUrl: string,
  path: string,
  init: RequestInit
): Promise<Response> {
  const gatewayResponse = await fetch(`${gatewayUrl}${path}`, init);
  const body = await gatewayResponse.json().catch(() => ({
    error: gatewayResponse.statusText,
  }));
  return NextResponse.json(
    gatewayResponse.ok
      ? body
      : stationRuntimeErrorBody(body, gatewayResponse.statusText),
    {
      status: gatewayResponse.status,
      headers: {
        "Cache-Control": "no-store",
        "Referrer-Policy": "no-referrer",
        "X-Content-Type-Options": "nosniff",
      },
    }
  );
}

async function forwardStationRuntimeStream(
  gatewayUrl: string,
  path: string,
  options: { lastEventId?: string } = {}
): Promise<Response> {
  const requestHeaders = options.lastEventId
    ? { "Last-Event-ID": options.lastEventId }
    : undefined;
  const gatewayResponse = await fetch(`${gatewayUrl}${path}`, {
    method: "GET",
    ...(requestHeaders ? { headers: requestHeaders } : {}),
  });
  const responseHeaders = new Headers();
  for (const name of [
    "content-type",
    "cache-control",
    "connection",
    "x-accel-buffering",
  ]) {
    const value = gatewayResponse.headers.get(name);
    if (value) {
      responseHeaders.set(name, value);
    }
  }
  return new Response(gatewayResponse.body, {
    status: gatewayResponse.status,
    headers: responseHeaders,
  });
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
// API Response Mapping
// ============================================================================

/**
 * Map API response fields to SDK-expected shape.
 *
 * Authbound returns snake_case REST conventions:
 *   { id, client_token, client_action: { kind, data }, verification_url, expires_at }
 *
 * SDK expects camelCase with semantic names:
 *   { verificationId, clientToken, authorizationRequestUrl, expiresAt, deepLink }
 */
function mapApiVerificationResponse(
  raw: Record<string, unknown>
): CreateVerificationResponse {
  const clientAction = (raw.client_action ?? raw.clientAction) as
    | { kind?: string; data?: string; expires_at?: string }
    | undefined;
  return {
    ...toBrowserVerificationResponse({
      id: String(raw.verificationId ?? raw.id ?? ""),
      clientToken:
        typeof raw.clientToken === "string"
          ? raw.clientToken
          : typeof raw.client_token === "string"
            ? raw.client_token
            : undefined,
      expiresAt:
        typeof raw.expiresAt === "string"
          ? raw.expiresAt
          : typeof raw.expires_at === "string"
            ? raw.expires_at
            : undefined,
      authorizationRequestUrl:
        typeof raw.authorizationRequestUrl === "string"
          ? raw.authorizationRequestUrl
          : undefined,
      deepLink: typeof raw.deepLink === "string" ? raw.deepLink : undefined,
      verificationUrl:
        typeof raw.verificationUrl === "string"
          ? raw.verificationUrl
          : typeof raw.verification_url === "string"
            ? raw.verification_url
            : undefined,
      clientAction: clientAction
        ? {
            kind: clientAction.kind,
            data: clientAction.data,
            expiresAt: clientAction.expires_at,
          }
        : undefined,
    }),
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
 * import { asPolicyId } from '@authbound/core';
 * import { createVerificationRoute } from '@authbound/nextjs/server';
 *
 * export const POST = createVerificationRoute({
 *   policyId: asPolicyId('pol_authbound_pension_v1'),
 * });
 * ```
 *
 * @example
 * ```ts
 * // With custom metadata
 * export const POST = createVerificationRoute({
 *   policyId: asPolicyId('pol_kyc_basic_authbound_v1'),
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
    sessionMode = "sdk",
    sessionSecret: configuredSessionSecret,
    cookieName = "__authbound",
    pendingCookieMaxAge = 600,
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
        const apiErrorMessage =
          apiErrorField(errorBody, "message") ??
          "Failed to create verification";
        const apiErrorCode = apiErrorField(errorBody, "code");
        if (debug) {
          console.error("[Authbound] API error:", summarizeApiError(errorBody));
        }
        return NextResponse.json(
          {
            error: apiErrorMessage,
            code: apiErrorCode,
            message: apiErrorMessage,
          },
          { status: gatewayResponse.status }
        );
      }

      const rawResponse = await gatewayResponse.json();

      // Map gateway response shape to SDK-expected shape
      let responseData: Record<string, unknown> = {
        ...mapApiVerificationResponse(rawResponse),
      };

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

      const response = NextResponse.json(responseData);
      const verificationId =
        typeof responseData.verificationId === "string"
          ? responseData.verificationId
          : undefined;
      const sessionSecret = getOptionalSessionSecret(configuredSessionSecret);
      if (sessionMode === "sdk" && verificationId && sessionSecret) {
        await setPendingVerificationCookie(response, {
          secret: sessionSecret,
          cookieName,
          verificationId,
          userRef:
            typeof body.customerUserRef === "string"
              ? body.customerUserRef
              : verificationId,
          maxAge: pendingCookieMaxAge,
        });
      }

      return response;
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

      if (error instanceof BrowserVerificationResponseError) {
        return NextResponse.json(
          {
            error: error.message,
            code: "INVALID_GATEWAY_RESPONSE",
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
// Station Runtime BFF Route Handlers
// ============================================================================

/**
 * Create a station entry BFF route.
 *
 * The handler proxies tokenized attendee entry requests to Gateway without
 * attaching a project secret key.
 */
export function createStationEntryRoute(
  options: StationRuntimeRouteOptions = {}
): (
  request: Request,
  context?: StationRuntimeRouteContext
) => Promise<Response> {
  const gatewayUrl =
    options.gatewayUrl ??
    getEnvVar("AUTHBOUND_API_URL", "https://api.authbound.io");

  return async (
    request: Request,
    context?: StationRuntimeRouteContext
  ): Promise<Response> => {
    const body = await readJsonBody(request);
    const stationId =
      (await stationRouteParam(context, "stationId")) ??
      (typeof body.stationId === "string" ? body.stationId : undefined);
    const token = stationToken(
      request,
      body,
      "token",
      "entryToken",
      "entry_token"
    );
    const clientRef =
      typeof body.client_ref === "string"
        ? body.client_ref
        : typeof body.clientRef === "string"
          ? body.clientRef
          : undefined;
    const transport =
      body.transport === "qr" ||
      body.transport === "nfc" ||
      body.transport === "link"
        ? body.transport
        : "link";

    if (!(stationId && token && clientRef)) {
      return NextResponse.json(
        { error: "stationId, token, and client_ref are required" },
        { status: 400 }
      );
    }

    const search = new URLSearchParams({ token });
    return forwardStationRuntimeRequest(
      gatewayUrl,
      `/v1/stations/public/${encodeURIComponent(stationId)}/verifications?${search.toString()}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ client_ref: clientRef, transport }),
      }
    );
  };
}

/**
 * Create a station display BFF route for Station Entry Display and Operator
 * Console feed reads. The display token only returns station-safe data.
 */
export function createStationDisplayRoute(
  options: StationRuntimeRouteOptions = {}
): (
  request: Request,
  context?: StationRuntimeRouteContext
) => Promise<Response> {
  const gatewayUrl =
    options.gatewayUrl ??
    getEnvVar("AUTHBOUND_API_URL", "https://api.authbound.io");

  return async (
    request: Request,
    context?: StationRuntimeRouteContext
  ): Promise<Response> => {
    const stationId = await stationRouteParam(context, "stationId");
    const token = stationToken(
      request,
      {},
      "token",
      "display_token",
      "displayToken"
    );
    if (!(stationId && token)) {
      return NextResponse.json(
        { error: "stationId and token are required" },
        { status: 400 }
      );
    }

    const search = new URLSearchParams({ token });
    const requestUrl = new URL(request.url);
    if (requestUrl.searchParams.get("refresh_entry_token") === "true") {
      search.set("refresh_entry_token", "true");
    }
    return forwardStationRuntimeRequest(
      gatewayUrl,
      `/v1/stations/public/${encodeURIComponent(stationId)}/display?${search.toString()}`,
      { method: "GET" }
    );
  };
}

/**
 * Create a station display event-stream BFF route for live operator feeds.
 */
export function createStationDisplayEventsRoute(
  options: StationRuntimeRouteOptions = {}
): (
  request: Request,
  context?: StationRuntimeRouteContext
) => Promise<Response> {
  const gatewayUrl =
    options.gatewayUrl ??
    getEnvVar("AUTHBOUND_API_URL", "https://api.authbound.io");

  return async (
    request: Request,
    context?: StationRuntimeRouteContext
  ): Promise<Response> => {
    const stationId = await stationRouteParam(context, "stationId");
    const token = stationToken(
      request,
      {},
      "token",
      "display_token",
      "displayToken"
    );
    if (!(stationId && token)) {
      return NextResponse.json(
        { error: "stationId and token are required" },
        { status: 400 }
      );
    }

    const search = new URLSearchParams({ token });
    const url = new URL(request.url);
    const after = url.searchParams.get("after");
    if (after) {
      search.set("after", after);
    }
    const lastEventId = request.headers.get("last-event-id") ?? undefined;
    return forwardStationRuntimeStream(
      gatewayUrl,
      `/v1/stations/public/${encodeURIComponent(stationId)}/display/events/sse?${search.toString()}`,
      { lastEventId }
    );
  };
}

/**
 * Create a station disclosure BFF route. Requires both the display token and
 * an active Operator Device Grant token.
 */
export function createStationDisclosureRoute(
  options: StationRuntimeRouteOptions = {}
): (
  request: Request,
  context?: StationRuntimeRouteContext
) => Promise<Response> {
  const gatewayUrl =
    options.gatewayUrl ??
    getEnvVar("AUTHBOUND_API_URL", "https://api.authbound.io");

  return async (
    request: Request,
    context?: StationRuntimeRouteContext
  ): Promise<Response> => {
    const stationId = await stationRouteParam(context, "stationId");
    const verificationId = await stationRouteParam(context, "verificationId");
    const displayToken = request.headers.get(STATION_DISPLAY_TOKEN_HEADER);
    const grantToken = request.headers.get(STATION_OPERATOR_GRANT_TOKEN_HEADER);
    if (!(stationId && verificationId && displayToken && grantToken)) {
      return NextResponse.json(
        {
          error:
            "stationId, verificationId, station display token header, and operator grant token header are required",
        },
        { status: 400 }
      );
    }

    return forwardStationRuntimeRequest(
      gatewayUrl,
      `/v1/stations/public/${encodeURIComponent(stationId)}/verifications/${encodeURIComponent(verificationId)}/disclosure`,
      {
        method: "GET",
        headers: {
          [STATION_DISPLAY_TOKEN_HEADER]: displayToken,
          [STATION_OPERATOR_GRANT_TOKEN_HEADER]: grantToken,
        },
      }
    );
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
    unsafeSkipWebhookSignatureVerification = false,
    debug = false,
  } = options;

  return async (request: Request): Promise<Response> => {
    try {
      // Get the raw body for signature verification
      const rawBody = await request.text();

      // Verify signature before parsing the body.
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
      } else if (!unsafeSkipWebhookSignatureVerification) {
        return NextResponse.json(
          {
            error: "Webhook secret is required",
            code: "WEBHOOK_SECRET_MISSING",
          },
          { status: 500 }
        );
      } else if (debug) {
        console.warn(
          "[Authbound] Webhook signature verification was explicitly skipped."
        );
      }

      // Parse the body (we already have it as text from signature verification)
      let eventBody: unknown;
      try {
        eventBody = JSON.parse(rawBody);
      } catch {
        return NextResponse.json(
          { error: "Invalid JSON payload", code: "INVALID_PAYLOAD" },
          { status: 400 }
        );
      }

      const parsed = WebhookEventSchema.safeParse(eventBody);
      if (!parsed.success) {
        if (debug) {
          console.error("[Authbound] Invalid webhook event");
        }
        return NextResponse.json(
          { error: "Invalid webhook event", code: "INVALID_PAYLOAD" },
          { status: 400 }
        );
      }
      const event = parsed.data;

      if (debug) {
        console.log("[Authbound] Webhook event:", summarizeWebhookEvent(event));
      }

      // Call event handler
      if (onEvent) {
        await onEvent(event);
      }

      // Call specific handlers
      switch (event.type) {
        case "verification.completed":
          if (onVerified) {
            await onVerified(event);
          }
          break;
        case "verification.failed":
        case "verification.canceled":
        case "verification.expired":
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

  /**
   * Trust Forwarded and X-Forwarded-* headers for public origin detection.
   * Enable only when the route runs behind a trusted reverse proxy.
   */
  trustProxy?: boolean;
}

export interface SessionRouteOptions {
  /**
   * Gateway URL.
   * @default Uses AUTHBOUND_API_URL env var
   */
  gatewayUrl?: string;

  /**
   * Authbound secret key used to retrieve signed verification results.
   * @default Uses AUTHBOUND_SECRET_KEY env var
   */
  secret?: string;

  /**
   * Deprecated. Session finalization now uses `secret` and the signed result
   * endpoint instead of client-token status polling.
   */
  publishableKey?: string;

  /**
   * Secret used to encrypt the local verification cookie.
   * @default Uses AUTHBOUND_SESSION_SECRET env var
   */
  sessionSecret?: string;

  /**
   * Verification cookie name.
   * @default "__authbound"
   */
  cookieName?: string;

  /**
   * Verification cookie max age in seconds.
   * @default 604800
   */
  cookieMaxAge?: number;

  /**
   * Public browser origins allowed to finalize SDK-managed sessions.
   * Configure this when the route runs behind a proxy that rewrites request URLs.
   */
  allowedOrigins?: string | string[];

  /**
   * Trust Forwarded and X-Forwarded-* headers for public origin detection.
   * Enable only when the route runs behind a trusted reverse proxy.
   */
  trustProxy?: boolean;

  /**
   * Optional user reference resolver for applications with existing auth.
   */
  getUserRef?: (request: Request) => string | Promise<string>;

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
    trustProxy = false,
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
      const headers: Record<string, string> = {
        Authorization: authorization,
        "X-Authbound-Publishable-Key": publishableKey,
      };
      const origin = originForStatusProxy(request, { trustProxy });
      if (origin) {
        headers.Origin = origin;
      }

      const response = await fetch(
        `${gatewayUrl}/v1/verifications/${encodeURIComponent(verificationId)}/status`,
        { headers }
      );

      if (!response.ok) {
        return NextResponse.json(
          { error: "Failed to get status" },
          { status: response.status }
        );
      }

      const data = (await response.json()) as Record<string, unknown>;
      const statusResponse = parseBrowserStatusSnapshot(data);
      if (!statusResponse.ok) {
        if (debug) {
          console.error(
            "[Authbound] Invalid status response:",
            summarizeError(statusResponse.error)
          );
        }
        return NextResponse.json(
          { error: "Invalid status response" },
          { status: 502 }
        );
      }

      return NextResponse.json(statusResponse.value);
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
// Session Route Handler
// ============================================================================

function getSessionSecret(fallback?: string): string {
  const value = fallback ?? process.env.AUTHBOUND_SESSION_SECRET;
  if (!value) {
    throw new Error(
      "Missing required environment variable: AUTHBOUND_SESSION_SECRET"
    );
  }
  return value;
}

function getOptionalSessionSecret(fallback?: string): string | undefined {
  return fallback ?? process.env.AUTHBOUND_SESSION_SECRET;
}

function getPendingCookieName(cookieName: string): string {
  return `${cookieName}_pending`;
}

function getCookieValue(request: Request, name: string): string | undefined {
  const cookieHeader = request.headers.get("cookie");
  if (!cookieHeader) {
    return;
  }

  for (const part of cookieHeader.split(";")) {
    const [rawName, ...rawValue] = part.trim().split("=");
    if (rawName === name) {
      return rawValue.join("=");
    }
  }
  return;
}

async function setPendingVerificationCookie(
  response: NextResponse,
  options: {
    secret: string;
    cookieName: string;
    verificationId: string;
    userRef: string;
    maxAge: number;
  }
): Promise<void> {
  const maxAge = Math.min(options.maxAge, 600);
  const token = await createToken({
    secret: options.secret,
    userRef: options.userRef,
    verificationId: options.verificationId,
    status: "PENDING",
    assuranceLevel: "NONE",
    expiresIn: maxAge,
  });

  response.cookies.set(getPendingCookieName(options.cookieName), token, {
    maxAge,
    path: "/",
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    httpOnly: true,
  });
}

async function getPendingVerificationFromRequest(
  request: Request,
  options: { secret: string; cookieName: string }
) {
  const token = getCookieValue(
    request,
    getPendingCookieName(options.cookieName)
  );
  if (!token) {
    return null;
  }

  return getVerificationFromToken(token, options.secret);
}

function clearPendingVerificationCookie(
  response: NextResponse,
  cookieName: string
): void {
  response.cookies.set(getPendingCookieName(cookieName), "", {
    maxAge: 0,
    path: "/",
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    httpOnly: true,
  });
}

/**
 * Create a same-origin browser session finalization route.
 */
export function createSessionRoute(
  options: SessionRouteOptions = {}
): (request: Request) => Promise<Response> {
  const {
    gatewayUrl = getEnvVar("AUTHBOUND_API_URL", "https://api.authbound.io"),
    secret: configuredSecret,
    sessionSecret: configuredSessionSecret,
    cookieName = "__authbound",
    cookieMaxAge = 60 * 60 * 24 * 7,
    allowedOrigins,
    trustProxy = false,
    getUserRef,
    debug = false,
  } = options;

  return async (request: Request): Promise<Response> => {
    try {
      if (
        !isSameOriginSessionRequest(request, { allowedOrigins, trustProxy })
      ) {
        return NextResponse.json(
          {
            error: "Cross-origin session finalization is not allowed",
            code: "CROSS_ORIGIN_FORBIDDEN",
          },
          { status: 403 }
        );
      }

      const body = (await request.json().catch(() => null)) as {
        verificationId?: unknown;
        clientToken?: unknown;
      } | null;
      const verificationId =
        typeof body?.verificationId === "string" ? body.verificationId : "";
      const clientToken =
        typeof body?.clientToken === "string" ? body.clientToken : "";

      if (!(verificationId && clientToken)) {
        return NextResponse.json(
          { error: "Invalid request", code: "INVALID_REQUEST" },
          { status: 400 }
        );
      }

      const sessionSecret = getSessionSecret(configuredSessionSecret);
      const pendingVerification = await getPendingVerificationFromRequest(
        request,
        { secret: sessionSecret, cookieName }
      );
      if (
        !pendingVerification ||
        pendingVerification.status !== "PENDING" ||
        pendingVerification.verificationId !== verificationId
      ) {
        return NextResponse.json(
          {
            error:
              "Verification finalization is not bound to this browser session",
            code: "VERIFICATION_BINDING_REQUIRED",
          },
          { status: 403 }
        );
      }

      const userRef = getUserRef
        ? await getUserRef(request)
        : pendingVerification.userRef;
      if (userRef !== pendingVerification.userRef) {
        return NextResponse.json(
          {
            error: "Verification finalization is not bound to the current user",
            code: "VERIFICATION_BINDING_REQUIRED",
          },
          { status: 403 }
        );
      }

      const client = new AuthboundClient({
        apiKey: getSecretKey(configuredSecret),
        apiUrl: gatewayUrl,
        debug,
      });
      const result = await client.verifications.getResult(verificationId);
      const verifiedSession = toVerifiedSessionFinalization(result);

      if (!verifiedSession) {
        return NextResponse.json(
          {
            error: "Verification is not verified",
            code: "VERIFICATION_NOT_VERIFIED",
          },
          { status: 409 }
        );
      }

      const token = await createToken({
        secret: sessionSecret,
        userRef,
        verificationId,
        status: "VERIFIED",
        assuranceLevel: "SUBSTANTIAL",
        age: verifiedSession.age,
        dateOfBirth: verifiedSession.dateOfBirth,
        expiresIn: cookieMaxAge,
      });
      const response = NextResponse.json({
        isVerified: true,
        verificationId,
        status: verifiedSession.status,
      });

      response.cookies.set(cookieName, token, {
        maxAge: cookieMaxAge,
        path: "/",
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        httpOnly: true,
      });
      clearPendingVerificationCookie(response, cookieName);

      return response;
    } catch (error) {
      if (debug) {
        console.error(
          "[Authbound] Session finalization error:",
          summarizeError(error)
        );
      }
      if (error instanceof AuthboundClientError) {
        return NextResponse.json(
          { error: error.message, code: error.code },
          { status: error.statusCode ?? 500 }
        );
      }
      return NextResponse.json(
        { error: "Internal server error", code: "INTERNAL_ERROR" },
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
 * import { asPolicyId } from '@authbound/core';
 * import { createVerification } from '@authbound/nextjs/server';
 *
 * export async function startVerification() {
 *   'use server';
 *   const verification = await createVerification({
 *     policyId: asPolicyId('pol_authbound_pension_v1'),
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
  metadata?: Record<string, unknown>;
}): Promise<CreateVerificationResponse> {
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
  return mapApiVerificationResponse(raw);
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
