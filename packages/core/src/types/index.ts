/**
 * Type exports for @authbound/core.
 *
 * This file aggregates all type definitions.
 */

// Branded types
export {
  type Brand,
  type PolicyId,
  type SessionId,
  type PublishableKey,
  type SecretKey,
  type ClientToken,
  isPolicyId,
  asPolicyId,
  parsePolicyId,
  isSessionId,
  asSessionId,
  isPublishableKey,
  asPublishableKey,
  isSecretKey,
  asSecretKey,
  getKeyEnvironment,
  asClientToken,
} from "./branded";

// Error types
export {
  type AuthboundErrorCode,
  type ErrorMetadata,
  AuthboundError,
  ERROR_MESSAGES,
  ERROR_METADATA,
  DOCS_BASE_URL,
  isAuthboundError,
  assertAuthboundError,
} from "./errors";

// Verification types
export {
  type EudiVerificationStatus,
  type Verdict,
  type VerificationClaims,
  type VerificationAttributes,
  type VerificationResult,
  type CreateSessionRequest,
  type CreateSessionResponse,
  type SessionStatusResponse,
  type StatusEvent,
  EudiVerificationStatusSchema,
  VerdictSchema,
  VerificationClaimsSchema,
  VerificationAttributesSchema,
  VerificationResultSchema,
  CreateSessionRequestSchema,
  CreateSessionResponseSchema,
  SessionStatusResponseSchema,
  StatusEventSchema,
  TERMINAL_STATUSES,
  isTerminalStatus,
} from "./verification";

// Policy types
export {
  type Policy,
  type CredentialRequirement,
  PolicySchema,
  CredentialRequirementSchema,
  PolicyPresets,
  PRESET_POLICIES,
} from "./policy";

// Token types
export {
  type ClientTokenClaims,
  type ResultTokenClaims,
  type WebhookTokenClaims,
  ClientTokenClaimsSchema,
  ResultTokenClaimsSchema,
  WebhookTokenClaimsSchema,
  TOKEN_TTL,
  TOKEN_ISSUER,
  RESULT_COOKIE_NAME,
} from "./tokens";
