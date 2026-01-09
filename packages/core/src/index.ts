/**
 * @authbound/core
 *
 * Framework-agnostic SDK for Authbound EUDI wallet verification.
 *
 * @example
 * ```ts
 * import { createClient, PolicyPresets } from '@authbound/core';
 *
 * const client = createClient({
 *   publishableKey: process.env.NEXT_PUBLIC_AUTHBOUND_PK,
 *   policyId: PolicyPresets.AGE_GATE_18,
 * });
 *
 * // Start verification
 * const { sessionId, authorizationRequestUrl, clientToken } =
 *   await client.startVerification();
 *
 * // Subscribe to status updates (SSE with polling fallback)
 * const cleanup = client.subscribeToStatus(sessionId, clientToken, (event) => {
 *   if (event.status === 'verified') {
 *     console.log('Verification successful!', event.result);
 *   }
 * });
 * ```
 */

// ============================================================================
// Client
// ============================================================================

export {
  // Main factory
  createClient,
  configure,
  getClient,
  isConfigured,
  type AuthboundClient,
  // Configuration
  resolveConfig,
  getConfigFromEnv,
  DEFAULT_CONFIG,
  type AuthboundClientConfig,
  type ResolvedConfig,
} from "./client";

// ============================================================================
// Types
// ============================================================================

// Branded types
export {
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
} from "./types/branded";

// Error types
export {
  type AuthboundErrorCode,
  AuthboundError,
  ERROR_MESSAGES,
  isAuthboundError,
  assertAuthboundError,
} from "./types/errors";

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
} from "./types/verification";

// Policy types
export {
  type Policy,
  type CredentialRequirement,
  PolicySchema,
  CredentialRequirementSchema,
  PolicyPresets,
  PRESET_POLICIES,
} from "./types/policy";

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
} from "./types/tokens";

// ============================================================================
// Status Subscriptions
// ============================================================================

export {
  createStatusSubscription,
  isSSESupported,
  type SSESubscriptionOptions,
  createPollingSubscription,
  pollOnce,
  DEFAULT_POLLING_CONFIG,
  type PollingConfig,
  type PollingSubscriptionOptions,
} from "./status";

// ============================================================================
// Link Builders
// ============================================================================

export {
  buildDeepLink,
  buildOpenID4VPDeepLink,
  buildCustomDeepLink,
  supportsDeepLinks,
  detectMobilePlatform,
  canOpenDeepLink,
  WALLET_SCHEMES,
  type WalletScheme,
  buildUniversalLink,
  buildWalletUniversalLink,
  buildSmartLink,
  getAppStoreLink,
  UNIVERSAL_LINK_BASE,
  WALLET_APP_STORES,
  type UniversalLinkOptions,
} from "./links";

// ============================================================================
// Policy Resolution
// ============================================================================

export {
  resolvePolicy,
  parseSemVer,
  compareSemVer,
  formatSemVer,
  findLatestVersion,
  matchesVersionRange,
  type SemVer,
  type ResolutionContext,
} from "./policy";

// ============================================================================
// Legacy Exports (from original types.ts)
// Keep for backwards compatibility
// ============================================================================

export * from "./types.legacy";
