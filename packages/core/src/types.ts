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

export const DocumentDataSchema = z.object({
  document_number: z.string().optional(),
  first_name: z.string().optional(),
  last_name: z.string().optional(),
  date_of_birth: z.string().optional(),
  date_of_expiry: z.string().optional(),
  issuing_country: z.string().optional(),
});

export type DocumentData = z.infer<typeof DocumentDataSchema>;

export const BiometricDataSchema = z.object({
  face_match_confidence: z.number(),
  liveness_verified: z.boolean(),
});

export type BiometricData = z.infer<typeof BiometricDataSchema>;

export const ErrorDetailSchema = z.object({
  code: z.string(),
  message: z.string(),
});

export type ErrorDetail = z.infer<typeof ErrorDetailSchema>;

// ============================================================================
// Verification Result
// ============================================================================

export const VerificationResultSchema = z.object({
  session_id: z.string(),
  status: VerificationStatusSchema,
  assurance_level: AssuranceLevelSchema,
  risk_score: z.number().optional(),
  document_data: DocumentDataSchema.optional(),
  biometrics: BiometricDataSchema.optional(),
  errors: z.array(ErrorDetailSchema).optional(),
});

export type VerificationResult = z.infer<typeof VerificationResultSchema>;

// ============================================================================
// Webhook Payload
// ============================================================================

export const WebhookPayloadSchema = z.object({
  session_id: z.string(),
  customer_user_ref: z.string(),
  status: VerificationStatusSchema,
  assurance_level: AssuranceLevelSchema,
  risk_score: z.number().optional(),
  document_data: DocumentDataSchema.optional(),
  biometrics: BiometricDataSchema.optional(),
  timestamp: z.string(),
});

export type WebhookPayload = z.infer<typeof WebhookPayloadSchema>;

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

