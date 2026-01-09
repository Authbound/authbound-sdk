/**
 * @authbound/nextjs
 *
 * Complete Authbound SDK for Next.js.
 *
 * This package provides everything you need to add EUDI wallet verification
 * to your Next.js application:
 *
 * - Simplified middleware (`withAuthbound`)
 * - Zero-config route handlers (`createSessionRoute`, `createWebhookRoute`)
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
 * // 2. app/api/authbound/session/route.ts
 * import { createSessionRoute } from '@authbound/nextjs';
 *
 * export const POST = createSessionRoute({
 *   policyId: 'age-gate-18@1.0.0',
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
  withAuthbound,
  type WithAuthboundOptions,
  // Lower-level middleware
  authboundMiddleware,
  chainMiddleware,
  createMatcherConfig,
  type AuthboundMiddleware,
  type MiddlewareOptions,
} from "./middleware";

// ============================================================================
// Server (from @authbound/nextjs/server)
// ============================================================================

export {
  // Zero-config route handlers
  createSessionRoute,
  createWebhookRoute,
  createStatusRoute,
  type SessionRouteOptions,
  type WebhookRouteOptions,
  type StatusRouteOptions,
  // Server utilities
  createSession,
  // Advanced handlers
  createAuthboundHandlers,
  createSessionHandler,
  createWebhookHandler,
  createStatusHandler,
  createSignOutHandler,
  // Cookie utilities
  getCookieName,
  getCookieValue,
  getSessionFromCookie,
  setSessionCookie,
  clearSessionCookie,
  // JWT utilities
  createToken,
  verifyToken,
  getSessionFromToken,
  // Configuration
  parseConfig,
  checkRequirements,
  calculateAge,
  // Types
  type AuthboundConfig,
  type AuthboundClaims,
  type AuthboundSession,
  type ProtectedRouteConfig,
  type VerificationRequirements,
  type RoutesConfig,
  type CookieOptions,
} from "./server";

// ============================================================================
// Client (from @authbound/nextjs/client)
// ============================================================================

// Note: Client components need 'use client' directive
// Re-export types only from main entry to avoid bundling issues
export type {
  AuthboundProviderProps,
  AuthboundContextValue,
  VerificationSession,
  UseVerificationOptions,
  UseVerificationReturn,
  QRCodeProps,
  VerificationStatusProps,
  StatusBadgeProps,
  VerificationWallProps,
  AuthboundAppearance,
  AuthboundVariables,
  AuthboundElements,
  AuthboundLayout,
} from "./client";

// ============================================================================
// Core types (from @authbound/core)
// ============================================================================

export {
  type PolicyId,
  type SessionId,
  type PublishableKey,
  type EudiVerificationStatus,
  type VerificationResult,
  type VerificationClaims,
  type StatusEvent,
  AuthboundError,
  type AuthboundErrorCode,
  isAuthboundError,
  PolicyPresets,
  isTerminalStatus,
} from "@authbound/core";
