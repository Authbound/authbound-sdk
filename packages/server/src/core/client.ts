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
 *   apiKey: process.env.AUTHBOUND_SECRET_KEY!,
 *   apiUrl: process.env.AUTHBOUND_API_URL, // optional
 * });
 *
 * // Create a verification
 * const verification = await client.verifications.create({
 *   policyId: 'pol_authbound_pension_v1',
 *   customerUserRef: 'user_123',
 * });
 *
 * // Get verification status
 * const status = await client.verifications.get(verification.id);
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
   * Defaults to "https://api.authbound.io" if not specified.
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

const DEFAULT_API_URL = "https://api.authbound.io";
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

const PublicVerificationStatusSchema = z.enum([
  "pending",
  "processing",
  "verified",
  "failed",
  "canceled",
  "expired",
]);

const GatewayVerificationStatusSchema = z.enum([
  "created",
  "awaiting_user",
  "awaiting_provider",
  "processing",
  "verified",
  "failed",
  "canceled",
  "expired",
]);

const ClientActionSchema = z.object({
  kind: z.enum(["qr", "link", "request_blob"]),
  data: z.string(),
  expires_at: z.string().optional(),
});

// Response schema for /v1/verifications endpoint.
const VerificationSchema = z.object({
  object: z.literal("verification"),
  id: z.string(),
  status: z.union([
    PublicVerificationStatusSchema,
    GatewayVerificationStatusSchema,
  ]),
  policy_id: z.string().optional(),
  policy_hash: z.string().optional(),
  provider: z.string().optional(),
  env_mode: z.enum(["test", "live"]).optional(),
  created_at: z.string().optional(),
  expires_at: z.string().optional(),
  terminal_at: z.string().optional(),
  failure_code: z.string().optional(),
  client_token: z.string().optional(),
  client_action: ClientActionSchema.optional(),
  verification_url: z.string().optional(),
  customer_user_ref: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

const VerificationListSchema = z.object({
  object: z.literal("list"),
  data: z.array(VerificationSchema),
  has_more: z.boolean().optional().default(false),
  next_cursor: z.string().nullable().optional(),
});

// Response schema for /v1/verifications/:id/status endpoint.
const VerificationStatusSchema = z.object({
  object: z.literal("verification_status"),
  id: z.string(),
  status: z.union([
    PublicVerificationStatusSchema,
    GatewayVerificationStatusSchema,
  ]),
  result: z
    .object({
      verified: z.boolean(),
      attributes: z.record(z.string(), z.unknown()).optional(),
      assertions: z.record(z.string(), z.unknown()).optional(),
    })
    .optional(),
  failure_code: z.string().optional(),
  client_action: ClientActionSchema.optional(),
});

const VerificationResultSchema = z.object({
  verification_id: z.string(),
  status: z.enum(["verified", "failed"]),
  result_token: z.string(),
  assertions: z.record(z.string(), z.unknown()).optional(),
  failure_code: z.string().optional(),
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

export interface CreateVerificationOptions {
  /**
   * Policy to use for this verification.
   */
  policyId: string;

  /**
   * Your reference for the end user.
   */
  customerUserRef?: string;

  /**
   * Metadata stored with the verification.
   */
  metadata?: Record<string, unknown>;

  /**
   * Optional provider override.
   */
  provider?: "auto" | "vcs" | "eudi";

  /**
   * Idempotency key for safe retries.
   */
  idempotencyKey?: string;
}

export interface ListVerificationsOptions {
  status?: PublicVerificationStatus;
  limit?: number;
  startingAfter?: string;
  endingBefore?: string;
}

export interface CancelVerificationOptions {
  idempotencyKey?: string;
}

export interface GetVerificationStatusOptions {
  clientToken: string;
  publishableKey: string;
}

export type PublicVerificationStatus = z.infer<
  typeof PublicVerificationStatusSchema
>;

export interface VerificationClientAction {
  kind: "qr" | "link" | "request_blob";
  data: string;
  expiresAt?: string;
}

export interface Verification {
  object: "verification";
  id: string;
  status: PublicVerificationStatus;
  policyId?: string;
  policyHash?: string;
  provider?: string;
  envMode?: "test" | "live";
  createdAt?: string;
  expiresAt?: string;
  terminalAt?: string;
  failureCode?: string;
  clientToken?: string;
  clientAction?: VerificationClientAction;
  verificationUrl?: string;
  customerUserRef?: string;
  metadata?: Record<string, unknown>;
}

export interface VerificationList {
  object: "list";
  data: Verification[];
  hasMore: boolean;
  nextCursor?: string;
}

export interface VerificationStatus {
  object: "verification_status";
  id: string;
  status: PublicVerificationStatus;
  result?: {
    verified: boolean;
    attributes?: Record<string, unknown>;
    assertions?: Record<string, unknown>;
  };
  failureCode?: string;
  clientAction?: VerificationClientAction;
}

export interface SignedVerificationResult {
  verificationId: string;
  status: "verified" | "failed";
  resultToken: string;
  assertions?: Record<string, unknown>;
  failureCode?: string;
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

function normalizeVerificationStatus(status: string): PublicVerificationStatus {
  switch (status) {
    case "created":
    case "awaiting_user":
    case "awaiting_provider":
    case "pending":
      return "pending";
    case "processing":
    case "verified":
    case "failed":
    case "canceled":
    case "expired":
      return status;
    default:
      throw new AuthboundClientError(
        `Invalid verification status from API: ${status}`,
        "INVALID_RESPONSE"
      );
  }
}

function mapClientAction(
  action: z.infer<typeof ClientActionSchema> | undefined
): VerificationClientAction | undefined {
  if (!action) {
    return;
  }

  return {
    kind: action.kind,
    data: action.data,
    expiresAt: action.expires_at,
  };
}

function mapVerification(
  raw: z.infer<typeof VerificationSchema>
): Verification {
  return {
    object: raw.object,
    id: raw.id,
    status: normalizeVerificationStatus(raw.status),
    policyId: raw.policy_id,
    policyHash: raw.policy_hash,
    provider: raw.provider,
    envMode: raw.env_mode,
    createdAt: raw.created_at,
    expiresAt: raw.expires_at,
    terminalAt: raw.terminal_at,
    failureCode: raw.failure_code,
    clientToken: raw.client_token,
    clientAction: mapClientAction(raw.client_action),
    verificationUrl: raw.verification_url,
    customerUserRef: raw.customer_user_ref,
    metadata: raw.metadata,
  };
}

function mapVerificationStatus(
  raw: z.infer<typeof VerificationStatusSchema>
): VerificationStatus {
  return {
    object: raw.object,
    id: raw.id,
    status: normalizeVerificationStatus(raw.status),
    result: raw.result,
    failureCode: raw.failure_code,
    clientAction: mapClientAction(raw.client_action),
  };
}

function mapSignedVerificationResult(
  raw: z.infer<typeof VerificationResultSchema>
): SignedVerificationResult {
  return {
    verificationId: raw.verification_id,
    status: raw.status,
    resultToken: raw.result_token,
    assertions: raw.assertions,
    failureCode: raw.failure_code,
  };
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
   * Verification APIs.
   */
  readonly verifications: VerificationsApi;

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
    this.verifications = new VerificationsApi(this);
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
      includeApiKey?: boolean;
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
        ...(options?.includeApiKey === false
          ? {}
          : { "X-Authbound-Key": this.apiKey }),
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

function parseApiResponse<T>(schema: z.ZodSchema<T>, response: unknown): T;
function parseApiResponse<T, R>(
  schema: z.ZodSchema<T>,
  response: unknown,
  mapper: (parsed: T) => R
): R;
function parseApiResponse<T, R>(
  schema: z.ZodSchema<T>,
  response: unknown,
  mapper?: (parsed: T) => R
): T | R {
  const parsed = schema.safeParse(response);
  if (!parsed.success) {
    throw new AuthboundClientError(
      "Invalid response from API",
      "INVALID_RESPONSE",
      undefined,
      parsed.error.format()
    );
  }
  return mapper ? mapper(parsed.data) : parsed.data;
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
// Verifications API
// ============================================================================

class VerificationsApi {
  constructor(private readonly client: AuthboundClient) {}

  /**
   * Create a new verification.
   */
  async create(options: CreateVerificationOptions): Promise<Verification> {
    const requestBody = {
      policy_id: options.policyId,
      ...(options.customerUserRef && {
        customer_user_ref: options.customerUserRef,
      }),
      ...(options.metadata && { metadata: options.metadata }),
      ...(options.provider && { provider: options.provider }),
    };

    const response = await this.client.request<unknown>(
      "POST",
      "/v1/verifications",
      requestBody,
      {
        headers: options.idempotencyKey
          ? { "Idempotency-Key": options.idempotencyKey }
          : undefined,
      }
    );

    return parseApiResponse(VerificationSchema, response, mapVerification);
  }

  /**
   * List verifications.
   */
  async list(options?: ListVerificationsOptions): Promise<VerificationList> {
    const params = new URLSearchParams();
    if (options?.status) {
      params.set("status", options.status);
    }
    if (options?.limit !== undefined) {
      params.set("limit", String(options.limit));
    }
    if (options?.startingAfter) {
      params.set("starting_after", options.startingAfter);
    }
    if (options?.endingBefore) {
      params.set("ending_before", options.endingBefore);
    }

    const suffix = params.toString() ? `?${params.toString()}` : "";
    const response = await this.client.request<unknown>(
      "GET",
      `/v1/verifications${suffix}`
    );
    const parsed = VerificationListSchema.safeParse(response);
    if (!parsed.success) {
      throw new AuthboundClientError(
        "Invalid response from API",
        "INVALID_RESPONSE",
        undefined,
        parsed.error.format()
      );
    }

    return {
      object: "list",
      data: parsed.data.data.map(mapVerification),
      hasMore: parsed.data.has_more,
      nextCursor: parsed.data.next_cursor ?? undefined,
    };
  }

  /**
   * Retrieve a verification with a secret key.
   */
  async get(verificationId: string): Promise<Verification> {
    const response = await this.client.request<unknown>(
      "GET",
      `/v1/verifications/${encodePathSegment(verificationId)}`
    );
    return parseApiResponse(VerificationSchema, response, mapVerification);
  }

  /**
   * Get client-token status.
   */
  async getStatus(
    verificationId: string,
    options: GetVerificationStatusOptions
  ): Promise<VerificationStatus> {
    const response = await this.client.request<unknown>(
      "GET",
      `/v1/verifications/${encodePathSegment(verificationId)}/status`,
      undefined,
      {
        includeApiKey: false,
        headers: {
          Authorization: `Bearer ${options.clientToken}`,
          "X-Authbound-Publishable-Key": options.publishableKey,
        },
      }
    );

    return parseApiResponse(
      VerificationStatusSchema,
      response,
      mapVerificationStatus
    );
  }

  /**
   * Cancel a verification with a secret key.
   */
  async cancel(
    verificationId: string,
    options?: CancelVerificationOptions
  ): Promise<Verification> {
    const response = await this.client.request<unknown>(
      "POST",
      `/v1/verifications/${encodePathSegment(verificationId)}/cancel`,
      undefined,
      {
        headers: options?.idempotencyKey
          ? { "Idempotency-Key": options.idempotencyKey }
          : undefined,
      }
    );
    return parseApiResponse(VerificationSchema, response, mapVerification);
  }

  /**
   * Get the signed verification result with a secret key.
   */
  async getResult(verificationId: string): Promise<SignedVerificationResult> {
    const response = await this.client.request<unknown>(
      "GET",
      `/v1/verifications/${encodePathSegment(verificationId)}/result`
    );
    return parseApiResponse(
      VerificationResultSchema,
      response,
      mapSignedVerificationResult
    );
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
 * Create a verification.
 *
 * This is a convenience wrapper around AuthboundClient.verifications.create().
 * For multiple API calls, prefer creating an AuthboundClient instance.
 *
 * @example
 * ```ts
 * import { createVerification } from '@authbound/server';
 *
 * const verification = await createVerification({
 *   apiKey: process.env.AUTHBOUND_SECRET_KEY!,
 *   policyId: 'pol_authbound_pension_v1',
 *   customerUserRef: 'user_123',
 * });
 * ```
 */
export async function createVerification(
  options: CreateVerificationOptions & {
    apiKey: string;
    apiUrl?: string;
  }
): Promise<Verification> {
  const { apiKey, apiUrl, ...verificationOptions } = options;
  const client = new AuthboundClient({ apiKey, apiUrl });
  return client.verifications.create(verificationOptions);
}

/**
 * Get verification status with a client token.
 *
 * This is a convenience wrapper around AuthboundClient.verifications.getStatus().
 * For multiple API calls, prefer creating an AuthboundClient instance.
 */
export async function getVerificationStatus(options: {
  apiUrl?: string;
  verificationId: string;
  clientToken: string;
  publishableKey: string;
}): Promise<VerificationStatus> {
  const { apiUrl, verificationId, clientToken, publishableKey } = options;
  const response = await fetch(
    `${apiUrl ?? DEFAULT_API_URL}/v1/verifications/${encodePathSegment(verificationId)}/status`,
    {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${clientToken}`,
        "X-Authbound-Publishable-Key": publishableKey,
      },
    }
  );

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    body = await response.text();
  }

  if (!response.ok) {
    const publicError =
      body &&
      typeof body === "object" &&
      !Array.isArray(body) &&
      (body as Record<string, unknown>).object === "error"
        ? (body as Record<string, unknown>)
        : undefined;

    throw new AuthboundClientError(
      typeof publicError?.message === "string"
        ? publicError.message
        : `API request failed: ${response.status} ${response.statusText}`,
      typeof publicError?.code === "string" ? publicError.code : "API_ERROR",
      response.status,
      body
    );
  }

  return parseApiResponse(
    VerificationStatusSchema,
    body,
    mapVerificationStatus
  );
}
