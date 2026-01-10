import { z } from "zod";
import type {
  VerificationStatus,
  AssuranceLevel,
  AuthboundClaims,
  AuthboundSession,
  WebhookEvent,
  WebhookEventType,
  VerificationSessionObject,
  VerificationSessionStatus,
  VerifiedOutputs,
  LastError,
  Dob,
  Sex,
} from "@authbound/core";
import {
  VerificationStatusSchema,
  AssuranceLevelSchema,
  AuthboundClaimsSchema,
  WebhookEventSchema,
  WebhookEventTypeSchema,
  VerificationSessionObjectSchema,
  VerificationSessionStatusSchema,
  VerifiedOutputsSchema,
  LastErrorSchema,
  DobSchema,
  SexSchema,
  calculateAge,
} from "@authbound/core";

// Re-export core types for convenience
export type {
  VerificationStatus,
  AssuranceLevel,
  AuthboundClaims,
  AuthboundSession,
  WebhookEvent,
  WebhookEventType,
  VerificationSessionObject,
  VerificationSessionStatus,
  VerifiedOutputs,
  LastError,
  Dob,
  Sex,
} from "@authbound/core";

export {
  VerificationStatusSchema,
  AssuranceLevelSchema,
  AuthboundClaimsSchema,
  WebhookEventSchema,
  WebhookEventTypeSchema,
  VerificationSessionObjectSchema,
  VerificationSessionStatusSchema,
  VerifiedOutputsSchema,
  LastErrorSchema,
  DobSchema,
  SexSchema,
  calculateAge,
} from "@authbound/core";

// ============================================================================
// Route Protection Configuration
// ============================================================================

export const VerificationRequirementsSchema = z.object({
  /** Require the user to be verified */
  verified: z.boolean().optional(),
  /** Minimum age requirement (calculated from DOB if available) */
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
  /** Cookie domain */
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

export type RoutesConfig = z.infer<typeof RoutesConfigSchema>;

// ============================================================================
// Main Authbound Configuration
// ============================================================================

export const AuthboundConfigSchema = z.object({
  /** Your Authbound API Key (server-side only) */
  apiKey: z.string().min(1, "API key is required"),
  /** Authbound API URL. Defaults to "https://api.authbound.com" */
  apiUrl: z.string().url().optional(),
  /** Secret key for JWT encryption (min 32 characters recommended) */
  secret: z.string().min(32, "Secret must be at least 32 characters"),
  /** Cookie configuration */
  cookie: CookieOptionsSchema.optional(),
  /** Routes configuration */
  routes: RoutesConfigSchema,
  /** Enable debug logging */
  debug: z.boolean().optional(),
});

export type AuthboundConfig = z.infer<typeof AuthboundConfigSchema>;

// ============================================================================
// JWT Claims & Session (re-exported from core)
// ============================================================================
// AuthboundClaims, AuthboundSession, and WebhookPayload are now imported from @authbound/core above

// ============================================================================
// API Response Types
// ============================================================================

export interface CreateSessionResponse {
  clientToken: string;
  sessionId: string;
  expiresAt?: string;
}

export interface SessionStatusResponse {
  session: AuthboundSession | null;
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
  /** Session data if available */
  session?: AuthboundSession;
  /** Reason for denial */
  reason?: string;
}

// ============================================================================
// Helper Functions
// ============================================================================
// calculateAge is now imported from @authbound/core above

/**
 * Check if verification requirements are met
 */
export function checkRequirements(
  session: AuthboundSession | null,
  requirements: VerificationRequirements
): { met: boolean; reason?: string } {
  if (!session) {
    return { met: false, reason: "No session found" };
  }

  if (requirements.verified && !session.isVerified) {
    return { met: false, reason: "Verification required" };
  }

  if (requirements.minAge !== undefined) {
    if (session.age === undefined) {
      return { met: false, reason: "Age verification required" };
    }
    if (session.age < requirements.minAge) {
      return {
        met: false,
        reason: `Minimum age of ${requirements.minAge} required`,
      };
    }
  }

  if (requirements.assuranceLevel) {
    const levels: AssuranceLevel[] = ["NONE", "LOW", "SUBSTANTIAL", "HIGH"];
    const requiredIndex = levels.indexOf(requirements.assuranceLevel);
    const currentIndex = levels.indexOf(session.assuranceLevel);

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
 * Calculate age from a DOB (Date of Birth) object.
 * Validates that the date is valid (e.g., rejects February 31st).
 *
 * @throws Error if the date is invalid
 */
export function calculateAgeFromDob(dob: Dob): number {
  if (dob.month < 1 || dob.month > 12) {
    throw new Error(
      `Invalid month: ${dob.month}. Month must be between 1 and 12.`
    );
  }
  if (dob.day < 1 || dob.day > 31) {
    throw new Error(
      `Invalid day: ${dob.day}. Day must be between 1 and 31.`
    );
  }

  const today = new Date();
  const birthDate = new Date(dob.year, dob.month - 1, dob.day);

  // Validate that the Date constructor didn't silently roll over
  // (e.g., Feb 31 becomes March 2 or 3)
  if (
    birthDate.getFullYear() !== dob.year ||
    birthDate.getMonth() !== dob.month - 1 ||
    birthDate.getDate() !== dob.day
  ) {
    throw new Error(
      `Invalid date: ${dob.year}-${String(dob.month).padStart(2, "0")}-${String(dob.day).padStart(2, "0")} does not exist.`
    );
  }

  let age = today.getFullYear() - birthDate.getFullYear();
  const monthDiff = today.getMonth() - birthDate.getMonth();

  if (
    monthDiff < 0 ||
    (monthDiff === 0 && today.getDate() < birthDate.getDate())
  ) {
    age--;
  }

  return age;
}

/**
 * Map webhook session status to internal verification status.
 * This is used when processing webhook events to determine the verification outcome.
 */
export function mapSessionStatusToVerificationStatus(
  status: VerificationSessionStatus
): VerificationStatus {
  switch (status) {
    case "verified":
      return "VERIFIED";
    case "failed":
    case "canceled":
      return "REJECTED";
    case "requires_input":
      return "MANUAL_REVIEW_NEEDED";
    case "processing":
    default:
      return "PENDING";
  }
}
