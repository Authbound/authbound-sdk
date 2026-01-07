/**
 * Session types for QuickID verification sessions
 * These types follow Stripe Identity API conventions for familiarity
 */

import { z } from "zod";

// ============================================================================
// Session Creation
// ============================================================================

/**
 * Parameters for creating a new verification session
 */
export const CreateSessionParamsSchema = z.object({
	/** Your internal user/customer reference (e.g., user ID, email) */
	customer_user_ref: z.string().min(1),
	/** URL to redirect after successful verification (HTTPS required in production) */
	callback_url: z.string().url(),
	/** URL to redirect on verification error (optional but recommended) */
	error_url: z.string().url().optional(),
	/** Display name for verification UI (optional) */
	customer_name: z.string().optional(),
	/** Reason for verification shown to user (optional) */
	reason: z.string().optional(),
});

export type CreateSessionParams = z.infer<typeof CreateSessionParamsSchema>;

/**
 * Response from session creation
 */
export const SessionCreatedSchema = z.object({
	/** Unique session identifier (UUID) */
	session_id: z.string().uuid(),
	/** JWT token for client-side SDK calls */
	client_token: z.string(),
	/** ISO 8601 timestamp when session expires */
	expires_at: z.string(),
});

export type SessionCreated = z.infer<typeof SessionCreatedSchema>;

// ============================================================================
// Session Status & Results
// ============================================================================

/**
 * Session status values (Stripe Identity compatible)
 */
export const SessionStatusSchema = z.enum([
	/** Waiting for user to start verification */
	"pending",
	/** Verification in progress (documents submitted) */
	"processing",
	/** Successfully verified */
	"verified",
	/** Verification rejected - user can retry */
	"requires_input",
	/** Verification failed - system error */
	"failed",
	/** User canceled verification */
	"canceled",
]);

export type SessionStatus = z.infer<typeof SessionStatusSchema>;

/**
 * Terminal statuses that won't change
 */
export const TERMINAL_STATUSES: SessionStatus[] = [
	"verified",
	"failed",
	"canceled",
];

/**
 * Check if a status is terminal (won't change)
 */
export function isTerminalStatus(status: SessionStatus): boolean {
	return TERMINAL_STATUSES.includes(status);
}

/**
 * Date of birth structure
 */
export const DobSchema = z.object({
	day: z.number().int().min(1).max(31),
	month: z.number().int().min(1).max(12),
	year: z.number().int().min(1900).max(2100),
});

export type Dob = z.infer<typeof DobSchema>;

/**
 * Sex/gender values
 */
export const SexSchema = z.enum(["male", "female", "unspecified"]);

export type Sex = z.infer<typeof SexSchema>;

/**
 * ID number type for identity verification
 */
export const IdNumberTypeSchema = z.enum(["fi_hetu", "us_ssn", "other"]);

export type IdNumberType = z.infer<typeof IdNumberTypeSchema>;

/**
 * Verified user outputs (extracted from documents)
 */
export const VerifiedOutputsSchema = z.object({
	first_name: z.string().optional(),
	last_name: z.string().optional(),
	dob: DobSchema.optional(),
	sex: SexSchema.optional(),
	id_number_type: IdNumberTypeSchema.optional(),
	/** Last 4 characters of ID number */
	id_number_last4: z.string().optional(),
	/** Masked ID number (e.g., "******-123A" for Finnish HETU) */
	id_number_masked: z.string().optional(),
});

export type VerifiedOutputs = z.infer<typeof VerifiedOutputsSchema>;

/**
 * Verification type
 */
export const VerificationTypeSchema = z.enum(["document", "id_number"]);

export type VerificationType = z.infer<typeof VerificationTypeSchema>;

/**
 * Last error from verification attempt
 */
export const LastErrorSchema = z.object({
	/** Machine-readable error code */
	code: z.string(),
	/** User-friendly error message */
	reason: z.string(),
});

export type LastError = z.infer<typeof LastErrorSchema>;

/**
 * Complete session result (Stripe Identity compatible structure)
 */
export const SessionResultSchema = z.object({
	/** Public session ID (e.g., "vs_01HX...") */
	id: z.string(),
	/** Object type - always "identity.verification_session" */
	object: z.literal("identity.verification_session"),
	/** Unix timestamp when session was created */
	created: z.number(),
	/** Whether this is a live (production) or test session */
	livemode: z.boolean(),
	/** Verification type */
	type: VerificationTypeSchema,
	/** Current session status */
	status: SessionStatusSchema,
	/** Your customer reference from session creation */
	client_reference_id: z.string(),
	/** Error details if status is requires_input or failed */
	last_error: LastErrorSchema.optional(),
	/** Verification report ID if available */
	last_verification_report: z.string().optional(),
	/** Verified user data (only populated when status is "verified") */
	verified_outputs: VerifiedOutputsSchema.optional(),
});

export type SessionResult = z.infer<typeof SessionResultSchema>;

// ============================================================================
// Internal API Response Types
// ============================================================================

/**
 * Internal verification result from API (different from public SessionResult)
 * Used for polling and internal communication
 */
export const InternalVerificationResultSchema = z.object({
	session_id: z.string().uuid().optional(),
	status: z
		.enum(["PENDING", "PROCESSING", "VERIFIED", "REJECTED", "FAILED", "CANCELED"])
		.optional(),
	document_data: z
		.object({
			document_number: z.string().optional(),
			first_name: z.string().optional(),
			last_name: z.string().optional(),
			date_of_birth: z.string().optional(),
			date_of_expiry: z.string().optional(),
			issuing_country: z.string().optional(),
			personal_id: z.string().optional(),
			sex: z.enum(["M", "F", "X"]).optional(),
		})
		.optional(),
	biometrics: z
		.object({
			face_match_confidence: z.number().optional(),
			liveness_verified: z.boolean().optional(),
			liveness_confidence: z.number().optional(),
		})
		.optional(),
	client_token: z.string().optional(),
	expires_at: z.string().optional(),
	callback_url: z.string().url().optional(),
	error_url: z.string().url().optional(),
	last_error: LastErrorSchema.optional(),
	customer_name: z.string().optional(),
	reason: z.string().optional(),
});

export type InternalVerificationResult = z.infer<
	typeof InternalVerificationResultSchema
>;
