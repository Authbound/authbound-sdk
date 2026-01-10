/**
 * Type exports for @authbound-sdk/core.
 *
 * This file aggregates all type definitions.
 */

// Branded types
export {
  asClientToken,
  asPolicyId,
  asPublishableKey,
  asSecretKey,
  asSessionId,
  type Brand,
  type ClientToken,
  getKeyEnvironment,
  isPolicyId,
  isPublishableKey,
  isSecretKey,
  isSessionId,
  type PolicyId,
  type PublishableKey,
  parsePolicyId,
  type SecretKey,
  type SessionId,
} from "./branded";

// Error types
export {
  AuthboundError,
  type AuthboundErrorCode,
  assertAuthboundError,
  DOCS_BASE_URL,
  ERROR_MESSAGES,
  ERROR_METADATA,
  type ErrorMetadata,
  isAuthboundError,
} from "./errors";
// Policy types
export {
  type CredentialRequirement,
  CredentialRequirementSchema,
  type Policy,
  PolicyPresets,
  PolicySchema,
  PRESET_POLICIES,
} from "./policy";
// Token types
export {
  type ClientTokenClaims,
  ClientTokenClaimsSchema,
  RESULT_COOKIE_NAME,
  type ResultTokenClaims,
  ResultTokenClaimsSchema,
  TOKEN_ISSUER,
  TOKEN_TTL,
  type WebhookTokenClaims,
  WebhookTokenClaimsSchema,
} from "./tokens";
// Verification types
export {
  type CreateSessionRequest,
  CreateSessionRequestSchema,
  type CreateSessionResponse,
  CreateSessionResponseSchema,
  type EudiVerificationStatus,
  EudiVerificationStatusSchema,
  isTerminalStatus,
  type SessionStatusResponse,
  SessionStatusResponseSchema,
  type StatusEvent,
  StatusEventSchema,
  TERMINAL_STATUSES,
  type Verdict,
  VerdictSchema,
  type VerificationAttributes,
  VerificationAttributesSchema,
  type VerificationClaims,
  VerificationClaimsSchema,
  type VerificationResult,
  VerificationResultSchema,
} from "./verification";
