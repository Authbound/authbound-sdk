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
  AuthboundProvider,
  AuthboundErrorBoundary,
  useAuthbound,
  useAuthboundOptional,
  type AuthboundProviderProps,
  type AuthboundErrorBoundaryProps,
  type AuthboundContextValue,
  type VerificationSession,
} from "./context/authbound-context";

// ============================================================================
// Hooks
// ============================================================================

export {
  useVerification,
  type UseVerificationOptions,
  type UseVerificationReturn,
} from "./hooks/useVerification";

// ============================================================================
// Components
// ============================================================================

export {
  QRCode,
  QRCodeWithLoading,
  type QRCodeProps,
} from "./components/qr-code";

export {
  VerificationStatus,
  StatusBadge,
  type VerificationStatusProps,
  type StatusBadgeProps,
} from "./components/verification-status";

export {
  VerificationWall,
  type VerificationWallProps,
} from "./components/verification-wall";

export {
  DeepLinkButton,
  useDeepLinkSupport,
  type DeepLinkButtonProps,
} from "./components/deep-link-button";

// ============================================================================
// Appearance Types
// ============================================================================

export {
  type AuthboundAppearance,
  type AuthboundVariables,
  type AuthboundElements,
  type AuthboundLayout,
  DEFAULT_VARIABLES,
  DARK_THEME_VARIABLES,
  variablesToCSSProperties,
  mergeAppearance,
} from "./types/appearance";

// ============================================================================
// Re-exports from @authbound/core
// ============================================================================

export {
  // Types
  type PolicyId,
  type SessionId,
  type PublishableKey,
  type EudiVerificationStatus,
  type VerificationResult,
  type VerificationClaims,
  type StatusEvent,
  // Error handling
  AuthboundError,
  type AuthboundErrorCode,
  isAuthboundError,
  // Policy presets
  PolicyPresets,
  // Utilities
  isTerminalStatus,
} from "@authbound/core";
