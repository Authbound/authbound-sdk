/**
 * @authbound/nextjs/client
 *
 * Client-side components and hooks for Next.js.
 * These are re-exports from @authbound/react with Next.js optimizations.
 *
 * @example
 * ```tsx
 * // app/verify/page.tsx
 * 'use client';
 *
 * import { VerificationWall } from '@authbound/nextjs/client';
 *
 * export default function VerifyPage() {
 *   return (
 *     <VerificationWall policyId="age-gate-18@1.0.0">
 *       <div>Protected content here</div>
 *     </VerificationWall>
 *   );
 * }
 * ```
 */

"use client";

// ============================================================================
// Re-export all React components and hooks
// ============================================================================

export {
  // Appearance
  type AuthboundAppearance,
  type AuthboundContextValue,
  type AuthboundElements,
  // Errors
  AuthboundError,
  type AuthboundErrorCode,
  type AuthboundLayout,
  // Provider
  AuthboundProvider,
  type AuthboundProviderProps,
  type AuthboundVariables,
  DARK_THEME_VARIABLES,
  DEFAULT_VARIABLES,
  // Deep Link Support (for mobile wallet opening)
  DeepLinkButton,
  type DeepLinkButtonProps,
  type EudiVerificationStatus,
  isAuthboundError,
  // Utilities
  isTerminalStatus,
  mergeAppearance,
  // Core types
  type PolicyId,
  // Policy presets
  PolicyPresets,
  type PublishableKey,
  // Components
  QRCode,
  type QRCodeProps,
  QRCodeWithLoading,
  type SessionId,
  StatusBadge,
  type StatusBadgeProps,
  type StatusEvent,
  type UseVerificationOptions,
  type UseVerificationReturn,
  useAuthbound,
  useAuthboundOptional,
  useDeepLinkSupport,
  // Hooks
  useVerification,
  type VerificationClaims,
  type VerificationResult,
  type VerificationSession,
  VerificationStatus,
  type VerificationStatusProps,
  VerificationWall,
  type VerificationWallProps,
  variablesToCSSProperties,
} from "@authbound/react";
