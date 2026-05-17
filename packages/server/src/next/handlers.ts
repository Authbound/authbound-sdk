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
  type CookieReadableRequest,
  clearPendingVerificationCookie,
  clearVerificationCookie,
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

async function applyCookieEffects(
  response: ReturnType<typeof createJsonResponse>,
  config: AuthboundConfig,
  effects: HandlerKernelCookieEffects | undefined
): Promise<void> {
  if (!effects) {
    return;
  }
  if (effects.setVerification) {
    await setVerificationCookie(response, config, effects.setVerification);
  }
  if (effects.clearVerification) {
    clearVerificationCookie(response, config);
  }
  if (effects.setPendingVerification) {
    await setPendingVerificationCookie(
      response,
      config,
      effects.setPendingVerification
    );
  }
  if (effects.clearPendingVerification) {
    clearPendingVerificationCookie(response, config);
  }
}

async function toResponse(
  result: HandlerKernelResponse,
  config: AuthboundConfig
): Promise<Response> {
  const response = createJsonResponse(result.body, result.status);
  try {
    await applyCookieEffects(response, config, result.cookies);
    return response;
  } catch (error) {
    const mapped = mapHandlerKernelException(error, "Cookie handling", config);
    return createJsonResponse(mapped.body, mapped.status);
  }
}

async function handleCreateVerification(
  request: Request,
  config: AuthboundConfig,
  options: HandlersOptions,
  client: AuthboundClient
): Promise<Response> {
  const requestBody = await request.json().catch(() => null);
  const getUserRef = options.getUserRef;
  return toResponse(
    await createVerificationHandlerKernel({
      requestBody,
      config,
      client,
      idempotencyKey: request.headers.get("idempotency-key") ?? undefined,
      getUserRef: getUserRef ? () => getUserRef(request) : undefined,
      onVerificationCreated: options.onVerificationCreated,
    }),
    config
  );
}

async function handleFinalizeSession(
  request: Request,
  config: AuthboundConfig,
  options: HandlersOptions,
  client: AuthboundClient
): Promise<Response> {
  const getUserRef = options.getUserRef;
  return toResponse(
    await finalizeSessionHandlerKernel({
      request,
      requestBody: await request.json().catch(() => null),
      pendingVerification: await getPendingVerificationFromCookie(
        request as CookieReadableRequest,
        config
      ),
      config,
      client,
      getUserRef: getUserRef ? () => getUserRef(request) : undefined,
    }),
    config
  );
}

async function handleWebhook(
  request: Request,
  config: AuthboundConfig,
  options: HandlersOptions
): Promise<Response> {
  return toResponse(
    await processWebhookHandlerKernel({
      rawBody: await request.text(),
      signature: request.headers.get("x-authbound-signature"),
      config,
      validateWebhookSignature: options.validateWebhookSignature
        ? (rawBody) =>
            options.validateWebhookSignature?.(request, rawBody) ?? false
        : undefined,
      onWebhook: options.onWebhook,
      onVerified: options.onVerified,
      onFailed: options.onFailed,
    }),
    config
  );
}

async function handleGetStatus(
  request: Request,
  config: AuthboundConfig
): Promise<Response> {
  return toResponse(
    await getStatusHandlerKernel({
      config,
      getVerification: () =>
        getVerificationFromCookie(request as CookieReadableRequest, config),
    }),
    config
  );
}

async function handleSignOut(
  _request: Request,
  config: AuthboundConfig
): Promise<Response> {
  return toResponse(await signOutHandlerKernel({ config }), config);
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
