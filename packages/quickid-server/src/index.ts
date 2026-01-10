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

// Re-export types from quickid-core for convenience
export type {
  BiometricErrorCode,
  // Session types
  CreateSessionParams,
  Dob,
  DocumentErrorCode,
  IdNumberType,
  LastError,
  ParsedSignatureHeader,
  // Error codes
  PublicErrorCode,
  SessionCreated,
  SessionResult,
  SessionStatus,
  Sex,
  SystemErrorCode,
  UserErrorCode,
  VerifiedOutputs,
  // Webhook types
  WebhookEvent,
  WebhookEventHandler,
  WebhookEventHandlers,
  WebhookEventType,
  WebhookVerifyOptions,
} from "@authbound/quickid-core";
// Re-export helper functions from quickid-core
export {
  ALL_WEBHOOK_EVENT_TYPES,
  DEFAULT_ERROR_MESSAGES,
  getErrorMessage,
  isBiometricError,
  isDocumentError,
  isPermanentError,
  // Error code helpers
  isRetryableError,
  isSystemError,
  isTerminalStatus,
  TERMINAL_STATUSES,
  WEBHOOK_API_VERSION,
} from "@authbound/quickid-core";

// Error classes
export {
  isQuickIDAPIError,
  isQuickIDAuthError,
  // Type guards
  isQuickIDError,
  isQuickIDSignatureError,
  QuickIDAPIError,
  QuickIDAuthenticationError,
  QuickIDConnectionError,
  QuickIDServerError,
  QuickIDSignatureVerificationError,
  QuickIDTimeoutError,
  QuickIDValidationError,
} from "./errors";
export type { PollOptions, QuickIDServerConfig } from "./quickid";
// Main client
export { QuickIDServer } from "./quickid";
// Webhook utilities (for advanced use cases)
export {
  constructEvent,
  generateSignatureHeader,
  parseSignatureHeader,
  signPayload,
  verifySignature,
} from "./webhooks";
