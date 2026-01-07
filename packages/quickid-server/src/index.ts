/**
 * @authbound/quickid-server
 *
 * Server-side SDK for Authbound QuickID identity verification.
 * Provides session management, polling, and webhook verification.
 *
 * @example
 * ```typescript
 * import { QuickIDServer } from "@authbound/quickid-server";
 *
 * const quickid = new QuickIDServer({
 *   apiKey: process.env.QUICKID_SECRET_KEY!,
 * });
 *
 * // Create a verification session
 * const session = await quickid.sessions.create({
 *   customer_user_ref: "user_123",
 *   callback_url: "https://myapp.com/verify/callback",
 * });
 *
 * // Handle webhooks
 * const event = quickid.webhookEvents.construct(
 *   rawBody,
 *   signatureHeader,
 *   webhookSecret
 * );
 * ```
 *
 * @packageDocumentation
 */

// Main client
export { QuickIDServer } from "./quickid";
export type { QuickIDServerConfig, PollOptions } from "./quickid";

// Error classes
export {
	QuickIDServerError,
	QuickIDAPIError,
	QuickIDAuthenticationError,
	QuickIDSignatureVerificationError,
	QuickIDConnectionError,
	QuickIDTimeoutError,
	QuickIDValidationError,
	// Type guards
	isQuickIDError,
	isQuickIDAPIError,
	isQuickIDAuthError,
	isQuickIDSignatureError,
} from "./errors";

// Webhook utilities (for advanced use cases)
export {
	signPayload,
	generateSignatureHeader,
	parseSignatureHeader,
	verifySignature,
	constructEvent,
} from "./webhooks";

// Re-export types from quickid-core for convenience
export type {
	// Session types
	CreateSessionParams,
	SessionCreated,
	SessionStatus,
	SessionResult,
	VerifiedOutputs,
	Dob,
	Sex,
	IdNumberType,
	LastError,
	// Webhook types
	WebhookEvent,
	WebhookEventType,
	WebhookEventHandler,
	WebhookEventHandlers,
	ParsedSignatureHeader,
	WebhookVerifyOptions,
	// Error codes
	PublicErrorCode,
	DocumentErrorCode,
	BiometricErrorCode,
	UserErrorCode,
	SystemErrorCode,
} from "@authbound/quickid-core";

// Re-export helper functions from quickid-core
export {
	isTerminalStatus,
	TERMINAL_STATUSES,
	ALL_WEBHOOK_EVENT_TYPES,
	WEBHOOK_API_VERSION,
	// Error code helpers
	isRetryableError,
	isSystemError,
	isPermanentError,
	isDocumentError,
	isBiometricError,
	getErrorMessage,
	DEFAULT_ERROR_MESSAGES,
} from "@authbound/quickid-core";
