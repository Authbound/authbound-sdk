/**
 * AuthboundClient - Framework-agnostic API client for Authbound verification.
 *
 * This is the single source of truth for all Authbound API calls.
 * Framework adapters (Express, Hono, Next.js) use this client internally.
 *
 * @example
 * ```ts
 * import { AuthboundClient } from '@authbound/server';
 *
 * const client = new AuthboundClient({
 *   apiKey: process.env.AUTHBOUND_API_KEY!,
 *   apiUrl: process.env.AUTHBOUND_API_URL, // optional
 * });
 *
 * // Create a verification session
 * const session = await client.sessions.create({
 *   userRef: 'user_123',
 *   callbackUrl: 'https://example.com/callback',
 * });
 *
 * // Get session status
 * const status = await client.sessions.get(session.sessionId);
 * ```
 */

import { z } from "zod";

// ============================================================================
// Configuration
// ============================================================================

export interface AuthboundClientConfig {
  /**
   * Your Authbound API key.
   * Get this from the Authbound dashboard.
   * Must start with "ab_test_" or "ab_live_".
   */
  apiKey: string;

  /**
   * Authbound API URL.
   * Defaults to "https://api.authbound.com" if not specified.
   */
  apiUrl?: string;

  /**
   * Request timeout in milliseconds.
   * Defaults to 30000 (30 seconds).
   */
  timeout?: number;

  /**
   * Enable debug logging.
   * Defaults to false.
   */
  debug?: boolean;
}

const DEFAULT_API_URL = "https://api.authbound.com";
const DEFAULT_TIMEOUT = 30_000; // 30 seconds

/**
 * Validate API key format.
 * API keys must start with "ab_test_" or "ab_live_".
 */
function validateApiKeyFormat(apiKey: string): boolean {
  return apiKey.startsWith("ab_test_") || apiKey.startsWith("ab_live_");
}

// ============================================================================
// Request/Response Schemas
// ============================================================================

const CreateSessionRequestSchema = z.object({
  customer_user_ref: z.string(),
  callback_url: z.string().url().optional(),
  policy_id: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

const CreateSessionResponseSchema = z.object({
  session_id: z.string(),
  client_token: z.string(),
  expires_at: z.string().optional(),
  verification_url: z.string().optional(),
  sse_token: z.string().optional(),
});

const SessionStatusResponseSchema = z.object({
  id: z.string(),
  status: z.enum([
    "created",
    "pending",
    "processing",
    "requires_input",
    "verified",
    "failed",
    "canceled",
    "expired",
  ]),
  client_reference_id: z.string().optional(),
  verified_outputs: z
    .object({
      dob: z
        .object({
          day: z.number(),
          month: z.number(),
          year: z.number(),
        })
        .optional(),
      first_name: z.string().optional(),
      last_name: z.string().optional(),
    })
    .optional(),
  last_error: z
    .object({
      code: z.string(),
      reason: z.string().optional(),
    })
    .optional(),
  created_at: z.string().optional(),
  updated_at: z.string().optional(),
});

// ============================================================================
// Public Types
// ============================================================================

export interface CreateSessionOptions {
  /**
   * Customer user reference - your internal user ID.
   * Used to correlate verification sessions with your users.
   */
  userRef: string;

  /**
   * Callback URL for webhook notifications.
   * Authbound will POST verification results to this URL.
   */
  callbackUrl?: string;

  /**
   * Policy ID for verification requirements.
   * E.g., "age_gate_18", "age_gate_21", "kyc_basic".
   */
  policyId?: string;

  /**
   * Additional metadata to attach to the session.
   */
  metadata?: Record<string, unknown>;
}

export interface CreateSessionResult {
  /**
   * Unique session ID.
   */
  sessionId: string;

  /**
   * Client token for browser-side operations.
   * Pass this to the client SDK for QR code generation.
   */
  clientToken: string;

  /**
   * Session expiration time (ISO 8601).
   */
  expiresAt?: string;

  /**
   * Direct URL for verification (if available).
   */
  verificationUrl?: string;

  /**
   * SSE token for real-time status updates.
   */
  sseToken?: string;
}

export interface GetSessionResult {
  /**
   * Session ID.
   */
  id: string;

  /**
   * Current verification status.
   */
  status:
    | "created"
    | "pending"
    | "processing"
    | "requires_input"
    | "verified"
    | "failed"
    | "canceled"
    | "expired";

  /**
   * Customer reference ID (your user ID).
   */
  clientReferenceId?: string;

  /**
   * Verified outputs (only present after successful verification).
   */
  verifiedOutputs?: {
    dob?: {
      day: number;
      month: number;
      year: number;
    };
    firstName?: string;
    lastName?: string;
  };

  /**
   * Last error (if verification failed).
   */
  lastError?: {
    code: string;
    reason?: string;
  };

  /**
   * Session creation time (ISO 8601).
   */
  createdAt?: string;

  /**
   * Last update time (ISO 8601).
   */
  updatedAt?: string;
}

export class AuthboundClientError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly statusCode?: number,
    public readonly details?: unknown
  ) {
    super(message);
    this.name = "AuthboundClientError";
  }
}

// ============================================================================
// AuthboundClient Class
// ============================================================================

export class AuthboundClient {
  private readonly apiKey: string;
  private readonly apiUrl: string;
  private readonly timeout: number;
  private readonly debug: boolean;

  /**
   * Sessions API for creating and querying verification sessions.
   */
  public readonly sessions: SessionsApi;

  /**
   * Webhooks API for signature verification.
   */
  public readonly webhooks: WebhooksApi;

  constructor(config: AuthboundClientConfig) {
    if (!config.apiKey) {
      throw new AuthboundClientError("API key is required", "MISSING_API_KEY");
    }

    if (!validateApiKeyFormat(config.apiKey)) {
      throw new AuthboundClientError(
        'Invalid API key format. API key must start with "ab_test_" or "ab_live_".',
        "INVALID_API_KEY_FORMAT"
      );
    }

    this.apiKey = config.apiKey;
    this.apiUrl = config.apiUrl ?? DEFAULT_API_URL;
    this.timeout = config.timeout ?? DEFAULT_TIMEOUT;
    this.debug = config.debug ?? false;

    // Initialize sub-APIs
    this.sessions = new SessionsApi(this);
    this.webhooks = new WebhooksApi();
  }

  /**
   * Make an authenticated request to the Authbound API.
   * @internal
   */
  async request<T>(
    method: "GET" | "POST" | "PATCH" | "DELETE",
    path: string,
    body?: unknown
  ): Promise<T> {
    const url = `${this.apiUrl}${path}`;

    if (this.debug) {
      console.log(`[AuthboundClient] ${method} ${url}`);
    }

    // Create AbortController for timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    const fetchOptions: RequestInit = {
      method,
      headers: {
        "Content-Type": "application/json",
        "X-Authbound-Key": this.apiKey,
      },
      signal: controller.signal,
    };

    if (body) {
      fetchOptions.body = JSON.stringify(body);
    }

    try {
      const response = await fetch(url, fetchOptions);

      if (!response.ok) {
        let errorBody: unknown;
        try {
          errorBody = await response.json();
        } catch {
          errorBody = await response.text();
        }

        if (this.debug) {
          console.error(
            `[AuthboundClient] Error ${response.status}:`,
            errorBody
          );
        }

        throw new AuthboundClientError(
          `API request failed: ${response.status} ${response.statusText}`,
          "API_ERROR",
          response.status,
          errorBody
        );
      }

      const data = await response.json();

      if (this.debug) {
        console.log(`[AuthboundClient] Response:`, data);
      }

      return data as T;
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        throw new AuthboundClientError(
          `Request timed out after ${this.timeout}ms`,
          "TIMEOUT",
          408
        );
      }
      throw error;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Get the configured API URL.
   */
  getApiUrl(): string {
    return this.apiUrl;
  }

  /**
   * Get the configured API key.
   */
  getApiKey(): string {
    return this.apiKey;
  }
}

// ============================================================================
// Sessions API
// ============================================================================

class SessionsApi {
  constructor(private readonly client: AuthboundClient) {}

  /**
   * Create a new verification session.
   *
   * @example
   * ```ts
   * const session = await client.sessions.create({
   *   userRef: 'user_123',
   *   callbackUrl: 'https://example.com/webhook',
   *   policyId: 'age_gate_18',
   * });
   *
   * console.log('Session ID:', session.sessionId);
   * console.log('Client Token:', session.clientToken);
   * ```
   */
  async create(options: CreateSessionOptions): Promise<CreateSessionResult> {
    const requestBody = {
      customer_user_ref: options.userRef,
      ...(options.callbackUrl && { callback_url: options.callbackUrl }),
      ...(options.policyId && { policy_id: options.policyId }),
      ...(options.metadata && { metadata: options.metadata }),
    };

    const response = await this.client.request<unknown>(
      "POST",
      "/sessions",
      requestBody
    );

    const parsed = CreateSessionResponseSchema.safeParse(response);
    if (!parsed.success) {
      throw new AuthboundClientError(
        "Invalid response from API",
        "INVALID_RESPONSE",
        undefined,
        parsed.error.format()
      );
    }

    return {
      sessionId: parsed.data.session_id,
      clientToken: parsed.data.client_token,
      expiresAt: parsed.data.expires_at,
      verificationUrl: parsed.data.verification_url,
      sseToken: parsed.data.sse_token,
    };
  }

  /**
   * Get the current status of a verification session.
   *
   * @example
   * ```ts
   * const status = await client.sessions.get('sess_abc123');
   *
   * if (status.status === 'verified') {
   *   console.log('Age verified:', status.verifiedOutputs?.dob);
   * }
   * ```
   */
  async get(sessionId: string): Promise<GetSessionResult> {
    const response = await this.client.request<unknown>(
      "GET",
      `/sessions/${sessionId}/status`
    );

    const parsed = SessionStatusResponseSchema.safeParse(response);
    if (!parsed.success) {
      throw new AuthboundClientError(
        "Invalid response from API",
        "INVALID_RESPONSE",
        undefined,
        parsed.error.format()
      );
    }

    return {
      id: parsed.data.id,
      status: parsed.data.status,
      clientReferenceId: parsed.data.client_reference_id,
      verifiedOutputs: parsed.data.verified_outputs
        ? {
            dob: parsed.data.verified_outputs.dob,
            firstName: parsed.data.verified_outputs.first_name,
            lastName: parsed.data.verified_outputs.last_name,
          }
        : undefined,
      lastError: parsed.data.last_error,
      createdAt: parsed.data.created_at,
      updatedAt: parsed.data.updated_at,
    };
  }
}

// ============================================================================
// Webhooks API
// ============================================================================

export interface VerifySignatureOptions {
  /**
   * Raw request body as string or Buffer.
   */
  payload: string | Buffer;

  /**
   * Value of the X-Authbound-Signature header.
   */
  signature: string;

  /**
   * Your webhook secret from the Authbound dashboard.
   */
  secret: string;

  /**
   * Tolerance in seconds for timestamp validation.
   * Defaults to 300 (5 minutes).
   */
  tolerance?: number;
}

class WebhooksApi {
  /**
   * Verify a webhook signature.
   *
   * @example
   * ```ts
   * const isValid = client.webhooks.verifySignature({
   *   payload: req.body, // raw body
   *   signature: req.headers['x-authbound-signature'],
   *   secret: process.env.AUTHBOUND_WEBHOOK_SECRET!,
   * });
   *
   * if (!isValid) {
   *   return res.status(401).json({ error: 'Invalid signature' });
   * }
   * ```
   */
  verifySignature(options: VerifySignatureOptions): boolean {
    // Import here to support edge runtimes
    const crypto = require("crypto") as typeof import("crypto");

    const { payload, signature, secret, tolerance = 300 } = options;

    // Parse signature header: "t=timestamp,v1=signature"
    const parts = signature.split(",");
    const timestampPart = parts.find((p) => p.startsWith("t="));
    const signaturePart = parts.find((p) => p.startsWith("v1="));

    if (!(timestampPart && signaturePart)) {
      return false;
    }

    const timestamp = Number.parseInt(timestampPart.slice(2), 10);
    const expectedSignature = signaturePart.slice(3);

    // Check timestamp is within tolerance
    const now = Math.floor(Date.now() / 1000);
    if (Math.abs(now - timestamp) > tolerance) {
      return false;
    }

    // Compute expected signature
    const payloadString =
      typeof payload === "string" ? payload : payload.toString("utf8");
    const signedPayload = `${timestamp}.${payloadString}`;

    const computedSignature = crypto
      .createHmac("sha256", secret)
      .update(signedPayload)
      .digest("hex");

    // Constant-time comparison
    try {
      return crypto.timingSafeEqual(
        Buffer.from(expectedSignature, "hex"),
        Buffer.from(computedSignature, "hex")
      );
    } catch {
      return false;
    }
  }
}

// ============================================================================
// Standalone Functions (for convenience)
// ============================================================================

/**
 * Create a verification session.
 *
 * This is a convenience wrapper around AuthboundClient.sessions.create().
 * For multiple API calls, prefer creating an AuthboundClient instance.
 *
 * @example
 * ```ts
 * import { createSession } from '@authbound/server';
 *
 * const session = await createSession({
 *   apiKey: process.env.AUTHBOUND_API_KEY!,
 *   userRef: 'user_123',
 *   callbackUrl: 'https://example.com/webhook',
 * });
 * ```
 */
export async function createSession(
  options: CreateSessionOptions & {
    apiKey: string;
    apiUrl?: string;
  }
): Promise<CreateSessionResult> {
  const { apiKey, apiUrl, ...sessionOptions } = options;
  const client = new AuthboundClient({ apiKey, apiUrl });
  return client.sessions.create(sessionOptions);
}

/**
 * Get session status.
 *
 * This is a convenience wrapper around AuthboundClient.sessions.get().
 * For multiple API calls, prefer creating an AuthboundClient instance.
 */
export async function getSessionStatus(options: {
  apiKey: string;
  apiUrl?: string;
  sessionId: string;
}): Promise<GetSessionResult> {
  const { apiKey, apiUrl, sessionId } = options;
  const client = new AuthboundClient({ apiKey, apiUrl });
  return client.sessions.get(sessionId);
}
