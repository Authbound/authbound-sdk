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
  asVerificationId,
  type Brand,
  type ClientToken,
  getKeyEnvironment,
  isPolicyId,
  isPublishableKey,
  isSecretKey,
  isVerificationId,
  type PolicyId,
  type PublishableKey,
  parsePolicyId,
  type SecretKey,
  type VerificationId,
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
  TOKEN_ISSUER,
  TOKEN_TTL,
  type WebhookTokenClaims,
  WebhookTokenClaimsSchema,
} from "./tokens";
// Verification types
export {
  type CreateVerificationOptions,
  CreateVerificationOptionsSchema,
  type CreateVerificationResponse,
  CreateVerificationResponseSchema,
  type EudiVerificationStatus,
  EudiVerificationStatusSchema,
  isTerminalStatus,
  type StatusEvent,
  StatusEventSchema,
  TERMINAL_STATUSES,
  type VerificationStatusResponse,
  VerificationStatusResponseSchema,
  type VerificationSuccess,
  type Verdict,
  VerdictSchema,
  type VerificationClaims,
  VerificationClaimsSchema,
} from "./verification";
