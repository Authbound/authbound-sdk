import { z } from "zod";

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

export type Dob = {
  day: number;
  month: number;
  year: number;
};

export const DobSchema = z.object({
  day: z.number().int().min(1).max(31),
  month: z.number().int().min(1).max(12),
  year: z.number().int(),
});

export type Sex = "male" | "female" | "unspecified";
export const SexSchema = z.enum(["male", "female", "unspecified"]);

export type LastError = {
  code: string;
  reason: string;
};

export const LastErrorSchema = z.object({
  code: z.string(),
  reason: z.string(),
});

export type VerifiedOutputs = {
  first_name?: string;
  last_name?: string;
  dob?: Dob;
  sex?: Sex;
  id_number_type?: "fi_hetu" | "us_ssn" | "other";
  id_number_last4?: string;
  id_number_masked?: string;
};

export const VerifiedOutputsSchema = z.object({
  first_name: z.string().optional(),
  last_name: z.string().optional(),
  dob: DobSchema.optional(),
  sex: SexSchema.optional(),
  id_number_type: z.enum(["fi_hetu", "us_ssn", "other"]).optional(),
  id_number_last4: z.string().optional(),
  id_number_masked: z.string().optional(),
});

export type VerificationEventStatus =
  | "requires_input"
  | "processing"
  | "verified"
  | "failed"
  | "canceled";

export const VerificationEventStatusSchema = z.enum([
  "requires_input",
  "processing",
  "verified",
  "failed",
  "canceled",
]);

export type VerificationEventObjectType = "document" | "id_number";

export const VerificationEventObjectTypeSchema = z.enum([
  "document",
  "id_number",
]);

export type VerificationEventObject = {
  id: string;
  object: "identity.verification_session";
  created: number;
  livemode: boolean;
  type: VerificationEventObjectType;
  status: VerificationEventStatus;
  client_reference_id: string;
  last_error?: LastError;
  last_verification_report?: string;
  verified_outputs?: VerifiedOutputs;
};

export const VerificationEventObjectSchema = z.object({
  id: z.string(),
  object: z.literal("identity.verification_session"),
  created: z.number(),
  livemode: z.boolean(),
  type: VerificationEventObjectTypeSchema,
  status: VerificationEventStatusSchema,
  client_reference_id: z.string(),
  last_error: LastErrorSchema.optional(),
  last_verification_report: z.string().optional(),
  verified_outputs: VerifiedOutputsSchema.optional(),
});

export type WebhookEventType =
  | "identity.verification_session.processing"
  | "identity.verification_session.verified"
  | "identity.verification_session.requires_input"
  | "identity.verification_session.failed"
  | "identity.verification_session.canceled"
  | "identity.verification_session.redacted";

export const WebhookEventTypeSchema = z.enum([
  "identity.verification_session.processing",
  "identity.verification_session.verified",
  "identity.verification_session.requires_input",
  "identity.verification_session.failed",
  "identity.verification_session.canceled",
  "identity.verification_session.redacted",
]);

export type WebhookEvent = {
  id: string;
  object: "event";
  api_version: string;
  created: number;
  livemode: boolean;
  type: WebhookEventType;
  data: {
    object: VerificationEventObject;
  };
};

export const WebhookEventSchema = z.object({
  id: z.string(),
  object: z.literal("event"),
  api_version: z.string(),
  created: z.number(),
  livemode: z.boolean(),
  type: WebhookEventTypeSchema,
  data: z.object({
    object: VerificationEventObjectSchema,
  }),
});

export const AuthboundClaimsSchema = z.object({
  sub: z.string(),
  sid: z.string(),
  status: VerificationStatusSchema,
  assurance: AssuranceLevelSchema,
  age: z.number().int().optional(),
  dateOfBirth: z.string().optional(),
  iat: z.number(),
  exp: z.number(),
});

export type AuthboundClaims = z.infer<typeof AuthboundClaimsSchema>;

export interface AuthboundVerificationContext {
  isVerified: boolean;
  status: VerificationStatus;
  assuranceLevel: AssuranceLevel;
  age?: number;
  verificationId: string;
  userRef: string;
  dateOfBirth?: string;
  expiresAt: Date;
}

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
  /** Authbound API URL. Defaults to "https://api.authbound.io" */
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
// API Response Types
// ============================================================================

export interface CreateVerificationResponse {
  clientToken: string;
  verificationId: string;
  expiresAt?: string;
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
 * Calculate age from an ISO date string.
 */
export function calculateAge(dateOfBirth: string): number {
  const today = new Date();
  const birthDate = new Date(dateOfBirth);
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

  if (requirements.minAge !== undefined) {
    if (verification.age === undefined) {
      return { met: false, reason: "Age verification required" };
    }
    if (verification.age < requirements.minAge) {
      return {
        met: false,
        reason: `Minimum age of ${requirements.minAge} required`,
      };
    }
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
    throw new Error(`Invalid day: ${dob.day}. Day must be between 1 and 31.`);
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
      return "REJECTED";
    case "requires_input":
      return "MANUAL_REVIEW_NEEDED";
    default:
      return "PENDING";
  }
}
