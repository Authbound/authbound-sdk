import { z } from "zod";

// ============================================================================
// Verification Status & Assurance Level
// ============================================================================

export const VerificationStatusSchema = z.enum([
  "VERIFIED",
  "REJECTED",
  "MANUAL_REVIEW_NEEDED",
  "PENDING",
]);

export type VerificationStatus = z.infer<typeof VerificationStatusSchema>;

// ============================================================================
// Public Error Codes
// Stable, user-safe error codes for client-side error handling
// ============================================================================

export const PublicErrorCodeSchema = z.enum([
  // User-actionable errors (requires_input) - user can retry with different input
  "document_unreadable",
  "document_expired",
  "document_type_not_supported",
  "document_mrz_invalid",
  "document_data_mismatch",
  "document_suspected_forgery",
  "insufficient_quality",
  "face_mismatch",
  "liveness_failed",
  "underage",
  "country_not_supported",
  "id_number_mismatch",
  "id_number_unverified_other",
  "document_unverified_other",
  // System errors (failed) - temporary issues, retry later
  "processing_error",
  "provider_error",
  "storage_error",
  "timeout",
]);

export type PublicErrorCode = z.infer<typeof PublicErrorCodeSchema>;

export const PublicErrorSchema = z.object({
  code: PublicErrorCodeSchema,
  reason: z.string(), // User-friendly message, safe to display
});

export type PublicError = z.infer<typeof PublicErrorSchema>;

export const AssuranceLevelSchema = z.enum([
  "NONE",
  "LOW",
  "SUBSTANTIAL",
  "HIGH",
]);

export type AssuranceLevel = z.infer<typeof AssuranceLevelSchema>;

// ============================================================================
// Document & Biometric Data
// ============================================================================

/**
 * MRZ Sex field values
 * M = Male, F = Female, X = Unspecified/Non-binary
 */
export const MrzSexSchema = z.enum(["M", "F", "X"]);
export type MrzSex = z.infer<typeof MrzSexSchema>;

/**
 * Document data extracted from identity documents.
 * Includes MRZ (Machine Readable Zone) and VIZ (Visual Inspection Zone) data.
 */
export const DocumentDataSchema = z.object({
  document_number: z.string().optional(),
  first_name: z.string().optional(),
  last_name: z.string().optional(),
  date_of_birth: z.string().optional(), // ISO date string (YYYY-MM-DD)
  date_of_expiry: z.string().optional(), // ISO date string (YYYY-MM-DD)
  issuing_country: z.string().optional(), // ISO 3166-1 alpha-2 or alpha-3
  personal_id: z.string().optional(), // Personal identification number (e.g., Finnish henkilötunnus)
  sex: MrzSexSchema.optional(), // From MRZ: M=Male, F=Female, X=Unspecified
});

export type DocumentData = z.infer<typeof DocumentDataSchema>;

/**
 * Biometric verification data from face matching and liveness checks.
 * All fields optional as they may not be collected yet during verification flow.
 */
export const BiometricDataSchema = z.object({
  face_match_confidence: z.number().optional(), // 0-100 confidence score
  liveness_verified: z.boolean().optional(), // Whether liveness check passed
  liveness_confidence: z.number().optional(), // 0-100 confidence from AWS Liveness
});

export type BiometricData = z.infer<typeof BiometricDataSchema>;

// ============================================================================
// Common Types (used across webhooks and reports)
// ============================================================================

/**
 * Sex/gender as used in Stripe Identity format (lowercase)
 * Different from MrzSex which uses uppercase M/F/X from MRZ spec
 */
export type Sex = "male" | "female" | "unspecified";
export const SexSchema = z.enum(["male", "female", "unspecified"]);

/**
 * Date of birth as structured object (Stripe Identity format)
 * Different from date_of_birth string in DocumentData
 */
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

/**
 * Error structure for verification failures
 */
export type LastError = {
  code: string;
  reason: string;
};

export const LastErrorSchema = z.object({
  code: z.string(),
  reason: z.string(),
});

// ============================================================================
// Verification Report Types (Stripe Identity-compatible)
// ============================================================================

/**
 * Status of an individual verification check
 */
export const CheckStatusSchema = z.enum(["verified", "unverified", "not_performed"]);
export type CheckStatus = z.infer<typeof CheckStatusSchema>;

/**
 * Error details for a failed check
 */
export const CheckErrorSchema = z.object({
  code: z.string(),
  reason: z.string(),
});
export type CheckError = z.infer<typeof CheckErrorSchema>;

// Alias for backwards compatibility with quickid-core
export const ErrorDetailSchema = CheckErrorSchema;
export type ErrorDetail = CheckError;

/**
 * Document type enum for verification reports
 */
export const DocumentTypeSchema = z.enum(["passport", "id_card", "driver_license", "other"]);
export type DocumentType = z.infer<typeof DocumentTypeSchema>;

/**
 * Document verification check results
 */
export const DocumentCheckSchema = z.object({
  status: CheckStatusSchema,
  error: CheckErrorSchema.optional(),
  first_name: z.string().optional(),
  last_name: z.string().optional(),
  dob: DobSchema.optional(),
  sex: SexSchema.optional(),
  issuing_country: z.string().optional(), // ISO 3166-1 alpha-2 or alpha-3
  document_type: DocumentTypeSchema.optional(),
  document_number_last4: z.string().optional(),
});
export type DocumentCheck = z.infer<typeof DocumentCheckSchema>;

/**
 * Selfie/face verification check results
 */
export const SelfieCheckSchema = z.object({
  status: CheckStatusSchema,
  error: CheckErrorSchema.optional(),
  face_match_confidence: z.number().optional(), // 0-100
  liveness_confidence: z.number().optional(), // 0-100
  liveness_verified: z.boolean().optional(),
});
export type SelfieCheck = z.infer<typeof SelfieCheckSchema>;

/**
 * ID number verification check results
 */
export const IdNumberCheckSchema = z.object({
  status: CheckStatusSchema,
  error: CheckErrorSchema.optional(),
  id_number_type: z.enum(["fi_hetu", "us_ssn", "other"]).optional(),
  id_number_last4: z.string().optional(),
  id_number_masked: z.string().optional(),
});
export type IdNumberCheck = z.infer<typeof IdNumberCheckSchema>;

/**
 * Full verification report object (Stripe Identity-compatible)
 */
export const VerificationReportObjectSchema = z.object({
  id: z.string(), // "vr_01HX..."
  object: z.literal("identity.verification_report"),
  created: z.number(), // Unix timestamp
  livemode: z.boolean(),
  verification_session: z.string(), // "vs_..."
  document: DocumentCheckSchema.optional(),
  selfie: SelfieCheckSchema.optional(),
  id_number: IdNumberCheckSchema.optional(),
});
export type VerificationReportObject = z.infer<typeof VerificationReportObjectSchema>;

// ============================================================================
// Webhook Types (Stripe Identity-compatible)
// ============================================================================

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

export type VerificationSessionStatus =
  | "requires_input"
  | "processing"
  | "verified"
  | "failed"
  | "canceled";

export const VerificationSessionStatusSchema = z.enum([
  "requires_input",
  "processing",
  "verified",
  "failed",
  "canceled",
]);

export type VerificationSessionType = "document" | "id_number";

export const VerificationSessionTypeSchema = z.enum(["document", "id_number"]);

export type VerificationSessionObject = {
  id: string;
  object: "identity.verification_session";
  created: number;
  livemode: boolean;
  type: VerificationSessionType;
  status: VerificationSessionStatus;
  client_reference_id: string;
  last_error?: LastError;
  last_verification_report?: string;
  verified_outputs?: VerifiedOutputs;
};

export const VerificationSessionObjectSchema = z.object({
  id: z.string(),
  object: z.literal("identity.verification_session"),
  created: z.number(),
  livemode: z.boolean(),
  type: VerificationSessionTypeSchema,
  status: VerificationSessionStatusSchema,
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
    object: VerificationSessionObject;
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
    object: VerificationSessionObjectSchema,
  }),
});

// ============================================================================
// JWT Claims & Session
// ============================================================================

export const AuthboundClaimsSchema = z.object({
  /** Subject - customer_user_ref */
  sub: z.string(),
  /** Session ID from Authbound */
  sid: z.string(),
  /** Verification status */
  status: VerificationStatusSchema,
  /** Assurance level achieved */
  assurance: AssuranceLevelSchema,
  /** User's age (calculated from DOB if available) */
  age: z.number().int().optional(),
  /** Date of birth in ISO format */
  dateOfBirth: z.string().optional(),
  /** Issued at timestamp */
  iat: z.number(),
  /** Expiration timestamp */
  exp: z.number(),
});

export type AuthboundClaims = z.infer<typeof AuthboundClaimsSchema>;

export interface AuthboundSession {
  /** Whether the user is verified */
  isVerified: boolean;
  /** Verification status */
  status: VerificationStatus;
  /** Assurance level */
  assuranceLevel: AssuranceLevel;
  /** User's age (if available) */
  age?: number;
  /** Session ID */
  sessionId: string;
  /** Customer user reference */
  userRef: string;
  /** Date of birth (if available) */
  dateOfBirth?: string;
  /** When the session expires */
  expiresAt: Date;
}

// ============================================================================
// Utilities
// ============================================================================

/**
 * Calculate age from date of birth
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

