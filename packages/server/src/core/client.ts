/**
 * AuthboundClient - Framework-agnostic API client for Authbound verification.
 *
 * This is the single source of truth for all Authbound API calls.
 * Framework adapters (Express, Hono, Next.js) use this client internally.
 *
 * @example
 * ```ts
 * import { AuthboundClient } from '@authbound-sdk/server';
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
   * Must start with "sk_test_" or "sk_live_".
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
 * API keys must start with "sk_test_" or "sk_live_".
 */
function validateApiKeyFormat(apiKey: string): boolean {
  return apiKey.startsWith("sk_test_") || apiKey.startsWith("sk_live_");
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

// Response schema for legacy /sessions endpoint
const LegacyCreateSessionResponseSchema = z.object({
  session_id: z.string(),
  client_token: z.string(),
  expires_at: z.string().optional(),
  verification_url: z.string().optional(),
  sse_token: z.string().optional(),
});

// Response schema for new /v1/verifications endpoint (Stripe-style)
const CreateVerificationResponseSchema = z.object({
  object: z.literal("verification"),
  id: z.string(),
  status: z.string(),
  policy_id: z.string().optional(),
  provider: z.string().optional(),
  env_mode: z.enum(["test", "live"]).optional(),
  created_at: z.string().optional(),
  expires_at: z.string().optional(),
  client_token: z.string(),
  client_action: z
    .object({
      kind: z.enum(["qr", "link", "request_blob"]),
      data: z.string(),
      expires_at: z.string().optional(),
    })
    .optional(),
  verification_url: z.string().optional(),
});

// Response schema for new /v1/verifications/:id/status endpoint
const VerificationStatusResponseSchema = z.object({
  object: z.literal("verification_status"),
  id: z.string(),
  status: z.enum([
    "pending",
    "processing",
    "verified",
    "failed",
    "canceled",
    "expired",
  ]),
  result: z
    .object({
      verified: z.boolean(),
      attributes: z.record(z.string(), z.unknown()).optional(),
    })
    .optional(),
});

const PublicCredentialFormatSchema = z.enum([
  "dc+sd-jwt",
  "mso_mdoc",
  "jwt_vc_json",
]);

const CredentialDefinitionAuthoringFormatSchema = z.enum([
  "dc+sd-jwt",
  "jwt_vc_json",
]);

const CredentialDefinitionClaimSchema = z.object({
  name: z.string(),
  path: z.array(z.string()),
  mandatory: z.boolean(),
  displayName: z.string(),
});

const CredentialDefinitionSchema = z.object({
  object: z.literal("issuer.credential_definition"),
  id: z.string(),
  credentialDefinitionId: z.string(),
  format: PublicCredentialFormatSchema,
  vct: z.string().optional(),
  title: z.string(),
  claims: z.array(CredentialDefinitionClaimSchema),
});

const CredentialDefinitionListSchema = z.object({
  object: z.literal("list"),
  data: z.array(CredentialDefinitionSchema),
});

const OpenId4VcIssuanceStatusSchema = z.enum([
  "offer_created",
  "ready_to_issue",
  "token_issued",
  "credential_issued",
  "canceled",
  "expired",
  "failed",
]);

const OpenId4VcIssuanceCredentialSchema = z.object({
  credentialDefinitionId: z.string(),
  format: PublicCredentialFormatSchema,
  status: z.string(),
});

const OpenId4VcIssuanceOfferSchema = z.object({
  object: z.literal("openid4vc_issuance"),
  id: z.string(),
  status: OpenId4VcIssuanceStatusSchema,
  credentialDefinitionId: z.string(),
  credentials: z.array(OpenId4VcIssuanceCredentialSchema),
  offerUri: z.string(),
  offerQrUri: z.string(),
  credentialIssuer: z.string(),
  issuanceMode: z.enum(["InTime", "Deferred"]),
  txCodeRequired: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
  metadata: z.record(z.string(), z.string()).optional(),
  expiresAt: z.string().optional(),
});

const OpenId4VcIssuanceListSchema = z.object({
  object: z.literal("list"),
  data: z.array(OpenId4VcIssuanceOfferSchema),
  nextCursor: z.string().optional(),
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
   * Verification ID.
   */
  id: string;

  /**
   * Current verification status.
   */
  status:
    | "pending"
    | "processing"
    | "verified"
    | "failed"
    | "canceled"
    | "expired";

  /**
   * Verification result (only present after successful verification).
   */
  result?: {
    verified: boolean;
    attributes?: Record<string, unknown>;
  };
}

export type PublicCredentialFormat = z.infer<
  typeof PublicCredentialFormatSchema
>;

export type CredentialDefinitionAuthoringFormat = z.infer<
  typeof CredentialDefinitionAuthoringFormatSchema
>;

export type CredentialDefinitionClaim = z.infer<
  typeof CredentialDefinitionClaimSchema
>;

export type CredentialDefinition = z.infer<typeof CredentialDefinitionSchema>;

export type CredentialDefinitionList = z.infer<
  typeof CredentialDefinitionListSchema
>;

export type OpenId4VcIssuanceStatus = z.infer<
  typeof OpenId4VcIssuanceStatusSchema
>;

export type OpenId4VcIssuanceCredential = z.infer<
  typeof OpenId4VcIssuanceCredentialSchema
>;

export type OpenId4VcIssuanceOffer = z.infer<
  typeof OpenId4VcIssuanceOfferSchema
>;

export type OpenId4VcIssuanceList = z.infer<typeof OpenId4VcIssuanceListSchema>;

export interface CreateOpenId4VcIssuanceOfferOptions {
  credentialDefinitionId?: string;
  vct?: string;
  claims: Record<string, unknown>;
  issuanceMode?: "InTime" | "Deferred";
  txCode?: string;
  urlScheme?: "openid-credential-offer://" | "haip://";
  metadata?: Record<string, string>;
  idempotencyKey?: string;
}

export interface CredentialDefinitionClaimInput {
  path: string[];
  mandatory?: boolean;
  displayName?: string;
}

export interface CreateCredentialDefinitionOptions {
  credentialDefinitionId: string;
  vct: string;
  format: CredentialDefinitionAuthoringFormat;
  title: string;
  claims?: CredentialDefinitionClaimInput[];
  aliases?: string[];
  rendering?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

export type UpdateCredentialDefinitionOptions = Partial<
  Omit<CreateCredentialDefinitionOptions, "credentialDefinitionId">
>;

export interface ListOpenId4VcIssuanceOptions {
  limit?: number;
  cursor?: string;
}

export interface UpdateOpenId4VcIssuanceOptions {
  claims?: Record<string, unknown>;
  credentialSubject?: Record<string, unknown>;
}

export class AuthboundClientError extends Error {
  readonly code: string;
  readonly statusCode?: number;
  readonly details?: unknown;

  constructor(
    message: string,
    code: string,
    statusCode?: number,
    details?: unknown
  ) {
    super(message);
    this.name = "AuthboundClientError";
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
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
  readonly sessions: SessionsApi;

  /**
   * Webhooks API for signature verification.
   */
  readonly webhooks: WebhooksApi;

  /**
   * Issuer configuration APIs.
   */
  readonly issuer: IssuerApi;

  /**
   * OpenID4VC issuance APIs.
   */
  readonly openId4Vc: OpenId4VcApi;

  constructor(config: AuthboundClientConfig) {
    if (!config.apiKey) {
      throw new AuthboundClientError("API key is required", "MISSING_API_KEY");
    }

    if (!validateApiKeyFormat(config.apiKey)) {
      throw new AuthboundClientError(
        'Invalid API key format. API key must start with "sk_test_" or "sk_live_".',
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
    this.issuer = new IssuerApi(this);
    this.openId4Vc = new OpenId4VcApi(this);
  }

  /**
   * Make an authenticated request to the Authbound API.
   * @internal
   */
  async request<T>(
    method: "GET" | "POST" | "PATCH" | "DELETE",
    path: string,
    body?: unknown,
    options?: {
      headers?: Record<string, string>;
    }
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
        ...(options?.headers ?? {}),
      },
      signal: controller.signal,
    };

    if (body !== undefined) {
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

        const publicError =
          errorBody &&
          typeof errorBody === "object" &&
          !Array.isArray(errorBody) &&
          (errorBody as Record<string, unknown>).object === "error"
            ? (errorBody as Record<string, unknown>)
            : undefined;

        throw new AuthboundClientError(
          typeof publicError?.message === "string"
            ? publicError.message
            : `API request failed: ${response.status} ${response.statusText}`,
          typeof publicError?.code === "string"
            ? publicError.code
            : "API_ERROR",
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

function parseApiResponse<T>(schema: z.ZodSchema<T>, response: unknown): T {
  const parsed = schema.safeParse(response);
  if (!parsed.success) {
    throw new AuthboundClientError(
      "Invalid response from API",
      "INVALID_RESPONSE",
      undefined,
      parsed.error.format()
    );
  }
  return parsed.data;
}

function buildQueryString(
  params: Record<string, string | number | undefined>
): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) {
      search.set(key, String(value));
    }
  }
  const queryString = search.toString();
  return queryString ? `?${queryString}` : "";
}

function encodePathSegment(value: string): string {
  return encodeURIComponent(value);
}

function assertCreateOfferIdentifier(
  options: CreateOpenId4VcIssuanceOfferOptions
): void {
  const hasCredentialDefinitionId = !!options.credentialDefinitionId;
  const hasVct = !!options.vct;
  if (hasCredentialDefinitionId === hasVct) {
    throw new AuthboundClientError(
      "Exactly one of credentialDefinitionId or vct is required",
      "VALIDATION_ERROR",
      400
    );
  }
}

function assertNonEmpty(value: string, field: string): void {
  if (!value.trim()) {
    throw new AuthboundClientError(
      `${field} is required`,
      "VALIDATION_ERROR",
      400
    );
  }
}

function assertCredentialDefinitionAuthoringFormat(format: string): void {
  if (!CredentialDefinitionAuthoringFormatSchema.safeParse(format).success) {
    throw new AuthboundClientError(
      "Unsupported credential definition format",
      "VALIDATION_ERROR",
      400
    );
  }
}

// ============================================================================
// Issuer API
// ============================================================================

class IssuerApi {
  readonly credentialDefinitions: CredentialDefinitionsApi;

  constructor(client: AuthboundClient) {
    this.credentialDefinitions = new CredentialDefinitionsApi(client);
  }
}

class CredentialDefinitionsApi {
  constructor(private readonly client: AuthboundClient) {}

  async list(): Promise<CredentialDefinitionList> {
    const response = await this.client.request<unknown>(
      "GET",
      "/v1/issuer/credential-definitions"
    );
    return parseApiResponse(CredentialDefinitionListSchema, response);
  }

  async get(credentialDefinitionId: string): Promise<CredentialDefinition> {
    assertNonEmpty(credentialDefinitionId, "credentialDefinitionId");
    const response = await this.client.request<unknown>(
      "GET",
      `/v1/issuer/credential-definitions/${encodePathSegment(credentialDefinitionId)}`
    );
    return parseApiResponse(CredentialDefinitionSchema, response);
  }

  async create(
    options: CreateCredentialDefinitionOptions
  ): Promise<CredentialDefinition> {
    assertNonEmpty(options.credentialDefinitionId, "credentialDefinitionId");
    assertNonEmpty(options.vct, "vct");
    assertNonEmpty(options.title, "title");
    assertCredentialDefinitionAuthoringFormat(options.format);
    const response = await this.client.request<unknown>(
      "POST",
      "/v1/issuer/credential-definitions",
      options
    );
    return parseApiResponse(CredentialDefinitionSchema, response);
  }

  async update(
    credentialDefinitionId: string,
    options: UpdateCredentialDefinitionOptions
  ): Promise<CredentialDefinition> {
    assertNonEmpty(credentialDefinitionId, "credentialDefinitionId");
    if (Object.keys(options).length === 0) {
      throw new AuthboundClientError(
        "At least one credential definition field is required",
        "VALIDATION_ERROR",
        400
      );
    }
    if (options.format) {
      assertCredentialDefinitionAuthoringFormat(options.format);
    }
    const response = await this.client.request<unknown>(
      "PATCH",
      `/v1/issuer/credential-definitions/${encodePathSegment(credentialDefinitionId)}`,
      options
    );
    return parseApiResponse(CredentialDefinitionSchema, response);
  }

  async archive(credentialDefinitionId: string): Promise<CredentialDefinition> {
    assertNonEmpty(credentialDefinitionId, "credentialDefinitionId");
    const response = await this.client.request<unknown>(
      "POST",
      `/v1/issuer/credential-definitions/${encodePathSegment(credentialDefinitionId)}/archive`
    );
    return parseApiResponse(CredentialDefinitionSchema, response);
  }
}

// ============================================================================
// OpenID4VC API
// ============================================================================

class OpenId4VcApi {
  readonly issuance: OpenId4VcIssuanceApi;

  constructor(client: AuthboundClient) {
    this.issuance = new OpenId4VcIssuanceApi(client);
  }
}

class OpenId4VcIssuanceApi {
  constructor(private readonly client: AuthboundClient) {}

  async createOffer(
    options: CreateOpenId4VcIssuanceOfferOptions
  ): Promise<OpenId4VcIssuanceOffer> {
    assertCreateOfferIdentifier(options);
    const { idempotencyKey, ...body } = options;
    const response = await this.client.request<unknown>(
      "POST",
      "/v1/openid4vc/issuance/offer",
      body,
      {
        headers: idempotencyKey
          ? { "Idempotency-Key": idempotencyKey }
          : undefined,
      }
    );
    return parseApiResponse(OpenId4VcIssuanceOfferSchema, response);
  }

  async list(
    options?: ListOpenId4VcIssuanceOptions
  ): Promise<OpenId4VcIssuanceList> {
    const response = await this.client.request<unknown>(
      "GET",
      `/v1/openid4vc/issuance${buildQueryString({
        limit: options?.limit,
        cursor: options?.cursor,
      })}`
    );
    return parseApiResponse(OpenId4VcIssuanceListSchema, response);
  }

  async get(issuanceId: string): Promise<OpenId4VcIssuanceOffer> {
    assertNonEmpty(issuanceId, "issuanceId");
    const response = await this.client.request<unknown>(
      "GET",
      `/v1/openid4vc/issuance/${encodePathSegment(issuanceId)}`
    );
    return parseApiResponse(OpenId4VcIssuanceOfferSchema, response);
  }

  async update(
    issuanceId: string,
    options: UpdateOpenId4VcIssuanceOptions
  ): Promise<OpenId4VcIssuanceOffer> {
    assertNonEmpty(issuanceId, "issuanceId");
    const response = await this.client.request<unknown>(
      "PATCH",
      `/v1/openid4vc/issuance/${encodePathSegment(issuanceId)}`,
      options
    );
    return parseApiResponse(OpenId4VcIssuanceOfferSchema, response);
  }

  async cancel(issuanceId: string): Promise<OpenId4VcIssuanceOffer> {
    assertNonEmpty(issuanceId, "issuanceId");
    const response = await this.client.request<unknown>(
      "POST",
      `/v1/openid4vc/issuance/${encodePathSegment(issuanceId)}/cancel`
    );
    return parseApiResponse(OpenId4VcIssuanceOfferSchema, response);
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
      policyId: options.policyId ?? "default",
      ...(options.userRef && { customerId: options.userRef }),
      ...(options.metadata && { metadata: options.metadata }),
    };

    const response = await this.client.request<unknown>(
      "POST",
      "/v1/verifications",
      requestBody
    );

    const parsed = CreateVerificationResponseSchema.safeParse(response);
    if (!parsed.success) {
      throw new AuthboundClientError(
        "Invalid response from API",
        "INVALID_RESPONSE",
        undefined,
        parsed.error.format()
      );
    }

    return {
      sessionId: parsed.data.id,
      clientToken: parsed.data.client_token,
      expiresAt: parsed.data.expires_at,
      verificationUrl: parsed.data.verification_url,
    };
  }

  /**
   * Get the current status of a verification session.
   *
   * @example
   * ```ts
   * const status = await client.sessions.get('vrf_abc123');
   *
   * if (status.status === 'verified') {
   *   console.log('Verified:', status.result);
   * }
   * ```
   */
  async get(sessionId: string): Promise<GetSessionResult> {
    const response = await this.client.request<unknown>(
      "GET",
      `/v1/verifications/${sessionId}/status`
    );

    const parsed = VerificationStatusResponseSchema.safeParse(response);
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
      result: parsed.data.result,
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
    const crypto = require("node:crypto") as typeof import("node:crypto");

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
 * import { createSession } from '@authbound-sdk/server';
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
