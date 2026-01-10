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

// Re-export error utilities
export {
  createSafeErrorResponse,
  logError,
  type SanitizedError,
  sanitizeError,
} from "../core/error-utils";
// Re-export JWT utilities for advanced use cases
export {
  claimsToSession,
  createToken,
  getSessionFromToken,
  isTokenExpired,
  refreshToken,
  verifyToken,
} from "../core/jwt";
// Re-export core types for convenience
export type {
  AssuranceLevel,
  AuthboundClaims,
  AuthboundConfig,
  AuthboundSession,
  CookieOptions,
  CreateSessionResponse,
  Dob,
  LastError,
  MiddlewareResult,
  ProtectedRouteConfig,
  RoutesConfig,
  SessionStatusResponse,
  Sex,
  VerificationRequirements,
  VerificationSessionObject,
  VerificationSessionStatus,
  VerificationStatus,
  VerifiedOutputs,
  // Webhook types
  WebhookEvent,
  WebhookEventType,
} from "../core/types";
// Re-export core utilities
export {
  calculateAge,
  checkRequirements,
  getDefaultCookieOptions,
  parseConfig,
} from "../core/types";
// Cookie Utilities
export {
  clearSessionCookie,
  createErrorResponse,
  createJsonResponse,
  createRedirectResponse,
  getCookieName,
  getCookieValue,
  getSessionFromCookie,
  type SetSessionCookieOptions,
  setSessionCookie,
} from "./cookies";
// API Handlers
export {
  type AuthboundHandlers,
  createAuthboundHandlers,
  createSessionHandler,
  createSignOutHandler,
  createStatusHandler,
  createWebhookHandler,
  type HandlersOptions,
} from "./handlers";
// Middleware
export {
  type AuthboundMiddleware,
  authboundMiddleware,
  chainMiddleware,
  createMatcherConfig,
  type MiddlewareOptions,
} from "./middleware";
