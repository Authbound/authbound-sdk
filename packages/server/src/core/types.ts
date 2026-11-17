import { z } from "zod";
import { AUTHBOUND_API_VERSION } from "../generated/api-contract";
import { meetsMinimumAge } from "./age-claims";

export const VerificationStatusSchema = z.enum([
  "VERIFIED",
  "REJECTED",
  "MANUAL_REVIEW_NEEDED",
  "PENDING",
]);

export type VerificationStatus = z.infer<typeof VerificationStatusSchema>;

export const AssuranceLevelSchema = z.enum([
  "NONE",
  "LOW",
  "SUBSTANTIAL",
  "HIGH",
]);

export type AssuranceLevel = z.infer<typeof AssuranceLevelSchema>;

export type LastError = {
  code: string;
  reason: string;
};

export const LastErrorSchema = z.object({
  code: z.string(),
  reason: z.string(),
});

export type VerificationEventStatus =
  | "created"
  | "awaiting_user"
  | "awaiting_provider"
  | "processing"
  | "verified"
  | "failed"
  | "canceled"
  | "expired";

export const VerificationEventStatusSchema = z.enum([
  "created",
  "awaiting_user",
  "awaiting_provider",
  "processing",
  "verified",
  "failed",
  "canceled",
  "expired",
]);

export type VerificationEventObjectType = "document" | "id_number";

export const VerificationEventObjectTypeSchema = z.enum([
  "document",
  "id_number",
]);

export type VerificationEventObject = {
  id: string;
  object: "verification";
  status: VerificationEventStatus;
  created?: number;
  livemode?: boolean;
  type?: VerificationEventObjectType;
  customer_user_ref?: string;
  failure_code?: string | null;
  last_error?: LastError;
  last_verification_report?: string;
};

export const VerificationEventObjectSchema = z.object({
  id: z.string(),
  object: z.literal("verification"),
  status: VerificationEventStatusSchema,
  created: z.number().optional(),
  livemode: z.boolean().optional(),
  type: VerificationEventObjectTypeSchema.optional(),
  customer_user_ref: z.string().optional(),
  failure_code: z.string().nullable().optional(),
  last_error: LastErrorSchema.optional(),
  last_verification_report: z.string().optional(),
});

export type WebhookEventType =
  | "verification.state_changed"
  | "verification.completed"
  | "verification.failed"
  | "verification.canceled"
  | "verification.expired";

export const WebhookEventTypeSchema = z.enum([
  "verification.state_changed",
  "verification.completed",
  "verification.failed",
  "verification.canceled",
  "verification.expired",
]);

export type WebhookEvent = {
  id: string;
  object: "event";
  api_version: typeof AUTHBOUND_API_VERSION;
  contract_revision: string;
  created: number;
  livemode: boolean;
  type: WebhookEventType;
  data: {
    object: VerificationEventObject;
  };
};

export const WebhookEventSchema = z
  .object({
    id: z.string(),
    object: z.literal("event"),
    api_version: z.literal(AUTHBOUND_API_VERSION),
    contract_revision: z.string(),
    created: z.number(),
    livemode: z.boolean(),
    type: WebhookEventTypeSchema,
    data: z.object({
      object: VerificationEventObjectSchema,
    }),
  })
  .superRefine((event, context) => {
    const { status, failure_code: failureCode } = event.data.object;

    if (event.type === "verification.completed" && status !== "verified") {
      context.addIssue({
        code: "custom",
        message: "verification.completed events must carry verified status",
        path: ["data", "object", "status"],
      });
    }

    if (event.type === "verification.failed" && status !== "failed") {
      context.addIssue({
        code: "custom",
        message: "verification.failed events must carry failed status",
        path: ["data", "object", "status"],
      });
    }

    if (event.type === "verification.canceled" && status !== "canceled") {
      context.addIssue({
        code: "custom",
        message: "verification.canceled events must carry canceled status",
        path: ["data", "object", "status"],
      });
    }

    if (event.type === "verification.expired" && status !== "expired") {
      context.addIssue({
        code: "custom",
        message: "verification.expired events must carry expired status",
        path: ["data", "object", "status"],
      });
    }

    if (status === "failed" && !failureCode) {
      context.addIssue({
        code: "custom",
        message:
          "failed webhook verification objects must include failure_code",
        path: ["data", "object", "failure_code"],
      });
    }

    if (status !== "failed" && failureCode) {
      context.addIssue({
        code: "custom",
        message:
          "failure_code is only valid for failed webhook verification objects",
        path: ["data", "object", "failure_code"],
      });
    }
  });

export const AuthboundClaimsSchema = z.object({
  sub: z.string(),
  sid: z.string(),
  status: VerificationStatusSchema,
  assurance: AssuranceLevelSchema,
  ageClaims: z.record(z.string(), z.unknown()).optional(),
  iat: z.number(),
  exp: z.number(),
});

export type AuthboundClaims = z.infer<typeof AuthboundClaimsSchema>;

export interface AuthboundVerificationContext {
  isVerified: boolean;
  status: VerificationStatus;
  assuranceLevel: AssuranceLevel;
  /** Disclosed age claims, unchanged; `minAge` is checked against these. */
  ageClaims?: Record<string, unknown>;
  verificationId: string;
  userRef: string;
  expiresAt: Date;
}

// ============================================================================
// Route Protection Configuration
// ============================================================================

export const VerificationRequirementsSchema = z.object({
  /** Require the user to be verified */
  verified: z.boolean().optional(),
  /**
   * Minimum age. Met by a disclosed `age_over_M` or `age_equal_or_over.M`
   * of `true` with M at least this value, or by a disclosed birth date.
   */
  minAge: z.number().int().positive().optional(),
  /** Minimum assurance level required */
  assuranceLevel: AssuranceLevelSchema.optional(),
});

export type VerificationRequirements = z.infer<
  typeof VerificationRequirementsSchema
>;

export const ProtectedRouteConfigSchema = z.object({
  /** Path pattern - string for exact/prefix match, or RegExp for pattern matching */
  path: z.union([z.string(), z.instanceof(RegExp)]),
  /** Requirements that must be met to access this route */
  requirements: VerificationRequirementsSchema,
});

export type ProtectedRouteConfig = z.infer<typeof ProtectedRouteConfigSchema>;

// ============================================================================
// Cookie Configuration
// ============================================================================

export const CookieOptionsSchema = z.object({
  /** Cookie name. Defaults to "__authbound" */
  name: z.string().optional(),
  /** Max age in seconds. Defaults to 7 days (604800) */
  maxAge: z.number().int().positive().optional(),
  /** Cookie path. Defaults to "/" */
  path: z.string().optional(),
  /**
   * Cookie domain. Parent-domain cookies shared by multiple browser origins
   * require app-owned server-side session coordination; do not combine them
   * with the browser SDK's sessionMode: "sdk".
   */
  domain: z.string().optional(),
  /** Secure flag. Defaults to true in production */
  secure: z.boolean().optional(),
  /** SameSite attribute. Defaults to "lax" */
  sameSite: z.enum(["strict", "lax", "none"]).optional(),
  /** HttpOnly flag. Defaults to true */
  httpOnly: z.boolean().optional(),
});

export type CookieOptions = z.infer<typeof CookieOptionsSchema>;

// ============================================================================
// Routes Configuration
// ============================================================================

export const RoutesConfigSchema = z.object({
  /** Array of protected route configurations */
  protected: z.array(ProtectedRouteConfigSchema),
  /** Path to redirect users for verification. e.g., "/verify" */
  verify: z.string(),
  /** Callback path for webhooks. e.g., "/api/authbound/callback" */
  callback: z.string().optional(),
});

export interface RoutesConfig {
  /** Array of protected route configurations */
  protected: readonly ProtectedRouteConfig[];
  /** Path to redirect users for verification. e.g., "/verify" */
  verify: string;
  /** Callback path for webhooks. e.g., "/api/authbound/callback" */
  callback?: string;
}

// ============================================================================
// Main Authbound Configuration
// ============================================================================

export const AuthboundConfigSchema = z.object({
  /** Your Authbound API Key (server-side only) */
  apiKey: z.string().min(1, "API key is required"),
  /** Publishable key used to verify client-token status requests */
  publishableKey: z.string().optional(),
  /** Authbound API URL. Defaults to "https://api.authbound.io" */
  apiUrl: z.string().url().optional(),
  /** Secret key for JWT encryption (min 32 characters recommended) */
  secret: z.string().min(32, "Secret must be at least 32 characters"),
  /** Webhook signing secret. Required unless unsafeSkipWebhookSignatureVerification is true. */
  webhookSecret: z.string().optional(),
  /** Webhook timestamp tolerance in seconds. Defaults to 300. */
  webhookTolerance: z.number().int().positive().optional(),
  /** Public browser origins allowed to finalize SDK-managed sessions. */
  allowedOrigins: z.union([z.string(), z.array(z.string())]).optional(),
  /** Trust Forwarded and X-Forwarded-* headers from a known reverse proxy. */
  trustProxy: z.boolean().optional(),
  /** Explicit test/demo escape hatch for unsigned webhooks. Never use in production. */
  unsafeSkipWebhookSignatureVerification: z.boolean().optional(),
  /** Cookie configuration */
  cookie: CookieOptionsSchema.optional(),
  /** Routes configuration */
  routes: RoutesConfigSchema,
  /** Enable debug logging */
  debug: z.boolean().optional(),
});

export interface AuthboundConfig {
  /** Your Authbound API Key (server-side only) */
  apiKey: string;
  /** Publishable key used to verify client-token status requests */
  publishableKey?: string;
  /** Authbound API URL. Defaults to "https://api.authbound.io" */
  apiUrl?: string;
  /** Secret key for JWT encryption (min 32 characters recommended) */
  secret: string;
  /** Webhook signing secret. Required unless unsafeSkipWebhookSignatureVerification is true. */
  webhookSecret?: string;
  /** Webhook timestamp tolerance in seconds. Defaults to 300. */
  webhookTolerance?: number;
  /** Public browser origins allowed to finalize SDK-managed sessions. */
  allowedOrigins?: string | string[];
  /** Trust Forwarded and X-Forwarded-* headers from a known reverse proxy. */
  trustProxy?: boolean;
  /** Explicit test/demo escape hatch for unsigned webhooks. Never use in production. */
  unsafeSkipWebhookSignatureVerification?: boolean;
  /** Cookie configuration */
  cookie?: CookieOptions;
  /** Routes configuration */
  routes: RoutesConfig;
  /** Enable debug logging */
  debug?: boolean;
}

// ============================================================================
// API Response Types
// ============================================================================

export interface CreateVerificationResponse {
  clientToken: string;
  verificationId: string;
  authorizationRequestUrl: string;
  expiresAt: string;
  deepLink?: string;
  walletHandoffKind?: "qr" | "link" | "request_blob" | "dc_api";
}

export interface VerificationStatusResponse {
  verification: AuthboundVerificationContext | null;
  isVerified: boolean;
}

// ============================================================================
// Middleware Types
// ============================================================================

export interface MiddlewareResult {
  /** Whether to allow the request to proceed */
  allowed: boolean;
  /** Redirect URL if not allowed */
  redirectUrl?: string;
  /** Verification context if available */
  verification?: AuthboundVerificationContext;
  /** Reason for denial */
  reason?: string;
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Check if verification requirements are met
 */
export function checkRequirements(
  verification: AuthboundVerificationContext | null,
  requirements: VerificationRequirements
): { met: boolean; reason?: string } {
  if (!verification) {
    return { met: false, reason: "No verification found" };
  }

  if (requirements.verified && !verification.isVerified) {
    return { met: false, reason: "Verification required" };
  }

  if (
    requirements.minAge !== undefined &&
    !meetsMinimumAge(verification.ageClaims, requirements.minAge)
  ) {
    return {
      met: false,
      reason: `Minimum age of ${requirements.minAge} required`,
    };
  }

  if (requirements.assuranceLevel) {
    const levels: AssuranceLevel[] = ["NONE", "LOW", "SUBSTANTIAL", "HIGH"];
    const requiredIndex = levels.indexOf(requirements.assuranceLevel);
    const currentIndex = levels.indexOf(verification.assuranceLevel);

    if (currentIndex < requiredIndex) {
      return {
        met: false,
        reason: `Assurance level ${requirements.assuranceLevel} required`,
      };
    }
  }

  return { met: true };
}

/**
 * Parse and validate Authbound configuration
 */
export function parseConfig(config: unknown): AuthboundConfig {
  return AuthboundConfigSchema.parse(config);
}

/**
 * Get default cookie options
 */
export function getDefaultCookieOptions(): Required<CookieOptions> {
  return {
    name: "__authbound",
    maxAge: 60 * 60 * 24 * 7, // 7 days
    path: "/",
    domain: "",
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    httpOnly: true,
  };
}

/**
 * Map webhook verification event status to internal verification status.
 * This is used when processing webhook events to determine the verification outcome.
 */
export function mapVerificationEventStatusToVerificationStatus(
  status: VerificationEventStatus
): VerificationStatus {
  switch (status) {
    case "verified":
      return "VERIFIED";
    case "failed":
    case "canceled":
    case "expired":
      return "REJECTED";
    case "created":
    case "awaiting_user":
    case "awaiting_provider":
    case "processing":
      return "PENDING";
    default: {
      const exhaustive: never = status;
      throw new Error(`Unsupported verification event status: ${exhaustive}`);
    }
  }
}
