/**
 * @authbound/nextjs
 *
 * Complete Authbound SDK for Next.js.
 *
 * This package provides everything you need to add EUDI wallet verification
 * to your Next.js application:
 *
 * - Simplified middleware (`withAuthbound`)
 * - Zero-config route handlers (`createVerificationRoute`, `createWebhookRoute`)
 * - React components and hooks (Provider, VerificationWall, useVerification)
 * - Full server-side utilities
 *
 * @example Quick Start
 * ```tsx
 * // 1. middleware.ts
 * import { withAuthbound } from '@authbound/nextjs';
 *
 * export default withAuthbound({
 *   publicRoutes: ['/', '/about'],
 * });
 *
 * export const config = { matcher: ['/((?!_next|static).*)'] };
 *
 * // 2. app/api/authbound/verification/route.ts
 * import { createVerificationRoute } from '@authbound/nextjs';
 *
 * export const POST = createVerificationRoute({
 *   policyId: 'pol_authbound_pension_v1',
 * });
 *
 * // 3. app/verify/page.tsx
 * 'use client';
 * import { AuthboundProvider, VerificationWall } from '@authbound/nextjs';
 *
 * export default function VerifyPage() {
 *   return (
 *     <AuthboundProvider publishableKey={process.env.NEXT_PUBLIC_AUTHBOUND_PK!}>
 *       <VerificationWall>
 *         <div>Welcome! You're verified.</div>
 *       </VerificationWall>
 *     </AuthboundProvider>
 *   );
 * }
 * ```
 */

// ============================================================================
// Middleware (from @authbound/nextjs/middleware)
// ============================================================================

export {
  type AuthboundMiddleware,
  type AuthboundNextRequest,
  // Lower-level middleware
  authboundMiddleware,
  chainMiddleware,
  createMatcherConfig,
  type MiddlewareOptions,
  type WithAuthboundOptions,
  withAuthbound,
} from "./middleware";

// ============================================================================
// Server (from @authbound/nextjs/server)
// ============================================================================

export {
  type AuthboundClaims,
  // Types
  type AuthboundConfig,
  type AuthboundVerificationContext,
  type CookieOptions,
  calculateAge,
  checkRequirements,
  clearVerificationCookie,
  // Advanced handlers
  createAuthboundHandlers,
  createSignOutHandler,
  createStatusHandler,
  createStatusRoute,
  // JWT utilities
  createToken,
  // Server utilities
  // Zero-config route handlers
  createVerification,
  createVerificationRoute,
  createWebhookHandler,
  createWebhookRoute,
  // Cookie utilities
  getCookieName,
  getCookieValue,
  getVerificationFromCookie,
  getVerificationFromToken,
  type ProtectedRouteConfig,
  // Configuration
  parseConfig,
  type RoutesConfig,
  type StatusRouteOptions,
  setVerificationCookie,
  type VerificationRequirements,
  type VerificationRouteOptions,
  verifyToken,
  type WebhookRouteOptions,
} from "./server";

// ============================================================================
// Client (from @authbound/nextjs/client)
// ============================================================================

// Note: Client components need 'use client' directive
// Re-export types only from main entry to avoid bundling issues
export type {
  AuthboundAppearance,
  AuthboundContextValue,
  AuthboundElements,
  AuthboundLayout,
  AuthboundProviderProps,
  AuthboundVariables,
  QRCodeProps,
  StatusBadgeProps,
  UseVerificationOptions,
  UseVerificationReturn,
  VerificationState,
  VerificationStatusProps,
  VerificationWallProps,
} from "./client";

// ============================================================================
// Core types (from @authbound/core)
// ============================================================================

export {
  AuthboundError,
  type AuthboundErrorCode,
  asPolicyId,
  type EudiVerificationStatus,
  isAuthboundError,
  isTerminalStatus,
  type PolicyId,
  PolicyPresets,
  type PublishableKey,
  type StatusEvent,
  type VerificationClaims,
  type VerificationId,
  type VerificationResult,
} from "@authbound/core";
