/**
 * @authbound/server/next
 *
 * Next.js specific exports for the Authbound Server SDK.
 * Provides middleware, API handlers, and utilities for identity/age verification.
 *
 * @example
 * ```ts
 * // middleware.ts
 * import { authboundMiddleware } from '@authbound/server/next';
 *
 * export default authboundMiddleware({
 *   apiKey: process.env.AUTHBOUND_API_KEY!,
 *   secret: process.env.AUTHBOUND_SECRET!,
 *   routes: {
 *     protected: [
 *       { path: '/dashboard', requirements: { verified: true } },
 *       { path: '/adult-content', requirements: { minAge: 18 } },
 *     ],
 *     verify: '/verify',
 *   },
 * });
 * ```
 *
 * @example
 * ```ts
 * // app/api/authbound/[...authbound]/route.ts
 * import { createAuthboundHandlers } from '@authbound/server/next';
 * import { authboundConfig } from '@/authbound.config';
 *
 * export const { GET, POST, DELETE } = createAuthboundHandlers(authboundConfig);
 * ```
 */

// Middleware
export {
  authboundMiddleware,
  chainMiddleware,
  createMatcherConfig,
  type AuthboundMiddleware,
  type MiddlewareOptions,
} from "./middleware";

// API Handlers
export {
  createAuthboundHandlers,
  createSessionHandler,
  createWebhookHandler,
  createStatusHandler,
  createSignOutHandler,
  type AuthboundHandlers,
  type HandlersOptions,
} from "./handlers";

// Cookie Utilities
export {
  getCookieName,
  getCookieValue,
  getSessionFromCookie,
  setSessionCookie,
  clearSessionCookie,
  createRedirectResponse,
  createJsonResponse,
  createErrorResponse,
  type SetSessionCookieOptions,
} from "./cookies";

// Re-export core types for convenience
export type {
  AuthboundConfig,
  AuthboundClaims,
  AuthboundSession,
  ProtectedRouteConfig,
  VerificationRequirements,
  RoutesConfig,
  CookieOptions,
  VerificationStatus,
  AssuranceLevel,
  CreateSessionResponse,
  SessionStatusResponse,
  MiddlewareResult,
  // Webhook types (Stripe Identity-compatible)
  WebhookEvent,
  WebhookEventType,
  VerificationSessionObject,
  VerificationSessionStatus,
  VerifiedOutputs,
  LastError,
  Dob,
  Sex,
} from "../core/types";

// Re-export core utilities
export {
  parseConfig,
  checkRequirements,
  calculateAge,
  getDefaultCookieOptions,
} from "../core/types";

// Re-export JWT utilities for advanced use cases
export {
  createToken,
  verifyToken,
  getSessionFromToken,
  refreshToken,
  isTokenExpired,
  claimsToSession,
} from "../core/jwt";

// Re-export error utilities
export {
  sanitizeError,
  logError,
  createSafeErrorResponse,
  type SanitizedError,
} from "../core/error-utils";
