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
  // Provider
  AuthboundProvider,
  useAuthbound,
  useAuthboundOptional,
  type AuthboundProviderProps,
  type AuthboundContextValue,
  type VerificationSession,
  // Hooks
  useVerification,
  type UseVerificationOptions,
  type UseVerificationReturn,
  // Components
  QRCode,
  QRCodeWithLoading,
  type QRCodeProps,
  VerificationStatus,
  StatusBadge,
  type VerificationStatusProps,
  type StatusBadgeProps,
  VerificationWall,
  type VerificationWallProps,
  // Appearance
  type AuthboundAppearance,
  type AuthboundVariables,
  type AuthboundElements,
  type AuthboundLayout,
  DEFAULT_VARIABLES,
  DARK_THEME_VARIABLES,
  variablesToCSSProperties,
  mergeAppearance,
  // Core types
  type PolicyId,
  type SessionId,
  type PublishableKey,
  type EudiVerificationStatus,
  type VerificationResult,
  type VerificationClaims,
  type StatusEvent,
  // Errors
  AuthboundError,
  type AuthboundErrorCode,
  isAuthboundError,
  // Policy presets
  PolicyPresets,
  // Utilities
  isTerminalStatus,
} from "@authbound/react";
