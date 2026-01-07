/**
 * Public error code taxonomy for QuickID verification
 *
 * These error codes are:
 * - Stable: codes don't change between API versions
 * - User-safe: reasons are safe to display to end users
 * - Actionable: codes indicate what users can do to resolve the issue
 */

import { z } from "zod";

// ============================================================================
// Error Code Categories
// ============================================================================

/**
 * Document-related errors - user can retry with better document/photo
 */
export const DocumentErrorCodeSchema = z.enum([
	/** Document image is unreadable or too blurry */
	"document_unreadable",
	/** Document has expired */
	"document_expired",
	/** Document type not supported (e.g., ID card when only passport accepted) */
	"document_type_not_supported",
	/** Machine-readable zone (MRZ) validation failed */
	"document_mrz_invalid",
	/** Data mismatch between visual and MRZ zones */
	"document_data_mismatch",
	/** Document appears to be forged or tampered */
	"document_suspected_forgery",
	/** Generic document verification failure */
	"document_unverified_other",
]);

export type DocumentErrorCode = z.infer<typeof DocumentErrorCodeSchema>;

/**
 * Biometric errors - user can retry with better selfie/liveness
 */
export const BiometricErrorCodeSchema = z.enum([
	/** Selfie doesn't match document photo */
	"face_mismatch",
	/** Liveness check failed (suspected photo/video of photo) */
	"liveness_failed",
	/** Image quality too low for verification */
	"insufficient_quality",
]);

export type BiometricErrorCode = z.infer<typeof BiometricErrorCodeSchema>;

/**
 * User-specific errors - may not be retryable
 */
export const UserErrorCodeSchema = z.enum([
	/** User is below minimum age requirement */
	"underage",
	/** Document issuing country not supported */
	"country_not_supported",
]);

export type UserErrorCode = z.infer<typeof UserErrorCodeSchema>;

/**
 * System errors - internal issues, may be retryable later
 */
export const SystemErrorCodeSchema = z.enum([
	/** Generic processing error */
	"processing_error",
	/** Upstream provider error (AWS, etc.) */
	"provider_error",
	/** Storage/upload error */
	"storage_error",
	/** Request timed out */
	"timeout",
]);

export type SystemErrorCode = z.infer<typeof SystemErrorCodeSchema>;

/**
 * ID number verification errors
 */
export const IdNumberErrorCodeSchema = z.enum([
	/** ID number doesn't match records */
	"id_number_mismatch",
	/** Generic ID number verification failure */
	"id_number_unverified_other",
]);

export type IdNumberErrorCode = z.infer<typeof IdNumberErrorCodeSchema>;

// ============================================================================
// Combined Error Code
// ============================================================================

/**
 * All public error codes
 */
export const PublicErrorCodeSchema = z.enum([
	// Document errors
	...DocumentErrorCodeSchema.options,
	// Biometric errors
	...BiometricErrorCodeSchema.options,
	// User errors
	...UserErrorCodeSchema.options,
	// System errors
	...SystemErrorCodeSchema.options,
	// ID number errors
	...IdNumberErrorCodeSchema.options,
]);

export type PublicErrorCode = z.infer<typeof PublicErrorCodeSchema>;

// ============================================================================
// Error Classification Helpers
// ============================================================================

/**
 * Errors that are user-actionable (user can retry with different input)
 */
const RETRYABLE_ERRORS: PublicErrorCode[] = [
	"document_unreadable",
	"document_mrz_invalid",
	"insufficient_quality",
	"face_mismatch",
	"liveness_failed",
	"document_unverified_other",
];

/**
 * Errors that are system-related (user should try again later)
 */
const SYSTEM_ERRORS: PublicErrorCode[] = [
	"processing_error",
	"provider_error",
	"storage_error",
	"timeout",
];

/**
 * Errors that are permanent (user cannot retry)
 */
const PERMANENT_ERRORS: PublicErrorCode[] = [
	"underage",
	"country_not_supported",
	"document_suspected_forgery",
];

/**
 * Check if error is user-actionable (they can retry with better input)
 */
export function isRetryableError(code: PublicErrorCode): boolean {
	return RETRYABLE_ERRORS.includes(code);
}

/**
 * Check if error is a system error (try again later)
 */
export function isSystemError(code: PublicErrorCode): boolean {
	return SYSTEM_ERRORS.includes(code);
}

/**
 * Check if error is permanent (cannot be resolved by retrying)
 */
export function isPermanentError(code: PublicErrorCode): boolean {
	return PERMANENT_ERRORS.includes(code);
}

/**
 * Check if error is document-related
 */
export function isDocumentError(code: PublicErrorCode): boolean {
	return DocumentErrorCodeSchema.safeParse(code).success;
}

/**
 * Check if error is biometric-related
 */
export function isBiometricError(code: PublicErrorCode): boolean {
	return BiometricErrorCodeSchema.safeParse(code).success;
}

// ============================================================================
// Default Error Messages
// ============================================================================

/**
 * Default user-friendly messages for each error code
 * These are safe to display directly to end users
 */
export const DEFAULT_ERROR_MESSAGES: Record<PublicErrorCode, string> = {
	// Document errors
	document_unreadable:
		"We couldn't read the document. Please retake the photo in good lighting.",
	document_expired:
		"The document appears to be expired. Please try again with a valid document.",
	document_type_not_supported:
		"This document type isn't supported. Please use a valid passport.",
	document_mrz_invalid:
		"We couldn't verify the document's machine-readable zone. Please try again with a clearer photo.",
	document_data_mismatch:
		"Some document details could not be verified. Please try again.",
	document_suspected_forgery:
		"We couldn't verify the authenticity of this document. Please try again.",
	document_unverified_other:
		"The document could not be verified. Please try again.",

	// Biometric errors
	face_mismatch:
		"The selfie did not match the document photo closely enough. Please try again.",
	liveness_failed:
		"We couldn't confirm liveness. Please try again in good lighting.",
	insufficient_quality:
		"The images were not high enough quality. Please retake them.",

	// User errors
	underage:
		"You must be at least 18 years old to complete identity verification.",
	country_not_supported:
		"Documents from your country are not currently supported. Please contact support for assistance.",

	// System errors
	processing_error:
		"We couldn't complete verification due to a processing error. Please try again later.",
	provider_error:
		"We couldn't complete verification due to an upstream provider error. Please try again later.",
	storage_error:
		"We couldn't store verification artifacts. Please try again later.",
	timeout: "The verification request timed out. Please try again.",

	// ID number errors
	id_number_mismatch:
		"The provided identification number could not be verified.",
	id_number_unverified_other:
		"The identification number could not be verified. Please try again.",
};

/**
 * Get the default user-friendly message for an error code
 */
export function getErrorMessage(code: PublicErrorCode): string {
	return DEFAULT_ERROR_MESSAGES[code];
}
