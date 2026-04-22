/**
 * @authbound-sdk/core
 *
 * Framework-agnostic SDK for Authbound EUDI wallet verification.
 *
 * @example
 * ```ts
 * import { createClient, PolicyPresets } from '@authbound-sdk/core';
 *
 * const client = createClient({
 *   publishableKey: process.env.NEXT_PUBLIC_AUTHBOUND_PK,
 *   policyId: PolicyPresets.AGE_GATE_18,
 * });
 *
 * // Start verification
 * const { verificationId, authorizationRequestUrl, clientToken } =
 *   await client.startVerification();
 *
 * // Subscribe to status updates (SSE with polling fallback)
 * const cleanup = client.subscribeToStatus(verificationId, clientToken, (event) => {
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
  asVerificationId,
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
// Preset Registry (Runtime Fetching)
// ============================================================================

export {
  clearPresetCache,
  fetchPresetRegistry,
  getPresetBySlug,
  getPresetPolicyId,
  type PresetFromRegistry,
  type PresetRegistry,
} from "./policy";
