/**
 * @authbound/react
 *
 * React SDK for Authbound EUDI wallet verification.
 *
 * @example
 * ```tsx
 * import {
 *   AuthboundProvider,
 *   useVerification,
 *   VerificationWall,
 * } from '@authbound/react';
 *
 * // Wrap your app
 * function App() {
 *   return (
 *     <AuthboundProvider
 *       publishableKey={process.env.NEXT_PUBLIC_AUTHBOUND_PK!}
 *       policyId="age-gate-18@1.0.0"
 *     >
 *       <YourApp />
 *     </AuthboundProvider>
 *   );
 * }
 *
 * // Use the hook
 * function VerifyPage() {
 *   const { status, startVerification, authorizationRequestUrl } = useVerification();
 *   // ...
 * }
 *
 * // Or use the full-page component
 * function ProtectedPage() {
 *   return (
 *     <VerificationWall policyId="age-gate-18@1.0.0">
 *       <ProtectedContent />
 *     </VerificationWall>
 *   );
 * }
 * ```
 */

// ============================================================================
// Context & Provider
// ============================================================================

export {
  type AuthboundContextValue,
  AuthboundErrorBoundary,
  type AuthboundErrorBoundaryProps,
  AuthboundProvider,
  type AuthboundProviderProps,
  useAuthbound,
  useAuthboundOptional,
  type VerificationSession,
} from "./context/authbound-context";

// ============================================================================
// Hooks
// ============================================================================

export {
  type UseVerificationOptions,
  type UseVerificationReturn,
  useVerification,
} from "./hooks/useVerification";

// ============================================================================
// Components
// ============================================================================

export {
  DeepLinkButton,
  type DeepLinkButtonProps,
  useDeepLinkSupport,
} from "./components/deep-link-button";
export {
  QRCode,
  type QRCodeProps,
  QRCodeWithLoading,
} from "./components/qr-code";
export {
  StatusBadge,
  type StatusBadgeProps,
  VerificationStatus,
  type VerificationStatusProps,
} from "./components/verification-status";
export {
  VerificationWall,
  type VerificationWallProps,
} from "./components/verification-wall";

// ============================================================================
// Appearance Types
// ============================================================================

export {
  type AuthboundAppearance,
  type AuthboundElements,
  type AuthboundLayout,
  type AuthboundVariables,
  DARK_THEME_VARIABLES,
  DEFAULT_VARIABLES,
  mergeAppearance,
  variablesToCSSProperties,
} from "./types/appearance";

// ============================================================================
// Re-exports from @authbound/core
// ============================================================================

export {
  // Error handling
  AuthboundError,
  type AuthboundErrorCode,
  type EudiVerificationStatus,
  isAuthboundError,
  // Utilities
  isTerminalStatus,
  // Types
  type PolicyId,
  // Policy presets
  PolicyPresets,
  type PublishableKey,
  type SessionId,
  type StatusEvent,
  type VerificationClaims,
  type VerificationResult,
} from "@authbound/core";
