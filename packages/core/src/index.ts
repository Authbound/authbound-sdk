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
  type AuthboundClient,
  type AuthboundClientConfig,
  configure,
  // Main factory
  createClient,
  DEFAULT_CONFIG,
  getClient,
  getConfigFromEnv,
  isConfigured,
  type ResolvedConfig,
  // Configuration
  resolveConfig,
} from "./client";

// ============================================================================
// Types
// ============================================================================

// Branded types
export {
  asClientToken,
  asPolicyId,
  asPublishableKey,
  asSecretKey,
  asSessionId,
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
} from "./types/branded";

// Error types
export {
  AuthboundError,
  type AuthboundErrorCode,
  assertAuthboundError,
  ERROR_MESSAGES,
  isAuthboundError,
} from "./types/errors";
// Policy types
export {
  type CredentialRequirement,
  CredentialRequirementSchema,
  type Policy,
  PolicyPresets,
  PolicySchema,
  PRESET_POLICIES,
} from "./types/policy";
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
} from "./types/tokens";
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
} from "./types/verification";

// ============================================================================
// Status Subscriptions
// ============================================================================

export {
  createPollingSubscription,
  createStatusSubscription,
  DEFAULT_POLLING_CONFIG,
  isSSESupported,
  type PollingConfig,
  type PollingSubscriptionOptions,
  pollOnce,
  type SSESubscriptionOptions,
} from "./status";

// ============================================================================
// Link Builders
// ============================================================================

export {
  buildCustomDeepLink,
  buildDeepLink,
  buildOpenID4VPDeepLink,
  buildSmartLink,
  buildUniversalLink,
  buildWalletUniversalLink,
  canOpenDeepLink,
  detectMobilePlatform,
  getAppStoreLink,
  supportsDeepLinks,
  UNIVERSAL_LINK_BASE,
  type UniversalLinkOptions,
  WALLET_APP_STORES,
  WALLET_SCHEMES,
  type WalletScheme,
} from "./links";

// ============================================================================
// Policy Resolution
// ============================================================================

export {
  compareSemVer,
  findLatestVersion,
  formatSemVer,
  matchesVersionRange,
  parseSemVer,
  type ResolutionContext,
  resolvePolicy,
  type SemVer,
} from "./policy";

// ============================================================================
// Legacy Exports (from original types.ts)
// Keep for backwards compatibility
// ============================================================================

export * from "./types.legacy";
