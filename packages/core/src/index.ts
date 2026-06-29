/**
 * @authbound/core
 *
 * Framework-agnostic SDK for Authbound wallet verification.
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
 * const { verificationId, authorizationRequestUrl, clientToken } =
 *   await client.startVerification();
 *
 * // Subscribe to status updates (SSE with polling fallback)
 * const cleanup = client.subscribeToStatus(verificationId, clientToken, (event) => {
 *   if (event.status === 'verified') {
 *     console.log('Verification successful!');
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

export {
  AUTHBOUND_API_VERSION,
  AUTHBOUND_API_VERSION_HEADER,
  AUTHBOUND_CONTRACT_REVISION,
  AUTHBOUND_CONTRACT_REVISION_HEADER,
  authboundContractHeaders,
  withAuthboundContractHeaders,
} from "./contract-headers";

export {
  buildStationDisclosureUrl,
  buildStationDisplayEventsUrl,
  buildStationDisplayUrl,
  buildStationEntryUrl,
  buildStationOperatorEventsUrl,
  buildStationOperatorUrl,
  STATION_DISPLAY_TOKEN_HEADER,
  STATION_OPERATOR_GRANT_TOKEN_HEADER,
  type StationRuntimeMode,
} from "./station-runtime";
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
export {
  type OperatorDeviceGrant,
  OperatorDeviceGrantSchema,
  type Station,
  type StationDisclosureProfile,
  StationDisclosureProfileSchema,
  type StationDisplay,
  StationDisplaySchema,
  type StationDisplayStation,
  StationDisplayStationSchema,
  type StationEvent,
  type StationEventList,
  StationEventListSchema,
  StationEventSchema,
  type StationList,
  StationListSchema,
  type StationSafeAssertions,
  StationSafeAssertionsSchema,
  StationSchema,
  type StationSpawn,
  StationSpawnSchema,
  type StationVerification,
  type StationVerificationDisclosure,
  StationVerificationDisclosureSchema,
  type StationVerificationList,
  StationVerificationListSchema,
  StationVerificationSchema,
} from "./types/stations";
// Token types
export {
  type ClientTokenClaims,
  ClientTokenClaimsSchema,
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
  type EudiVerificationOptions,
  EudiVerificationOptionsSchema,
  type EudiVerifierAttestation,
  EudiVerifierAttestationSchema,
  type FinalizeVerificationResponse,
  FinalizeVerificationResponseSchema,
  isTerminalStatus,
  type StatusEvent,
  StatusEventSchema,
  TERMINAL_STATUSES,
  type Verdict,
  VerdictSchema,
  type VerificationClaims,
  VerificationClaimsSchema,
  type VerificationProviderOptions,
  VerificationProviderOptionsSchema,
  type VerificationStatusResponse,
  VerificationStatusResponseSchema,
  type VerificationSuccess,
  type WalletHandoffKind,
  WalletHandoffKindSchema,
} from "./types/verification";

export {
  isTerminalVerificationProgressStatus,
  isTerminalVerificationUiStatus,
  type ProviderPreference,
  ProviderPreferenceSchema,
  PublicCreateVerificationResponseSchema,
  PublicVerificationListSchema,
  PublicVerificationSchema,
  PublicVerificationStatusSnapshotSchema,
  parseProviderPreference,
  parseVerificationProgressStatus,
  projectVerificationStatusForUi,
  type SelectedVerificationProvider,
  SelectedVerificationProviderSchema,
  SignedVerificationResultSchema,
  TERMINAL_VERIFICATION_PROGRESS_STATUSES,
  TERMINAL_VERIFICATION_UI_STATUSES,
  VerificationClientActionSchema,
  type VerificationClientActionWire,
  type VerificationFailureCode,
  VerificationFailureCodeSchema,
  type VerificationProgressStatus,
  VerificationProgressStatusSchema,
  type VerificationUiStatus,
  VerificationUiStatusSchema,
} from "./types/verification-contract";

export {
  type BrowserVerificationFlowClient,
  type BrowserVerificationFlowController,
  type BrowserVerificationFlowOptions,
  type BrowserVerificationFlowStartOptions,
  type BrowserVerificationFlowState,
  createBrowserVerificationFlow,
} from "./verification/browser-flow";

export {
  isSameOriginSessionRequest,
  normalizeBrowserOrigin,
  originForStatusProxy,
  publicRequestOrigin,
  type SessionOriginOptions,
  type SessionOriginRequest,
} from "./verification/session-origin";

export {
  resolveWalletAuthorizationRequest,
  resolveWalletHandoff,
  type WalletAuthorizationRequestInput,
  type WalletAuthorizationRequestResolution,
  type WalletClientAction,
  type WalletHandoffResolution,
} from "./verification/wallet-authorization";

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

export { type ResolutionContext, resolvePolicy } from "./policy";

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
