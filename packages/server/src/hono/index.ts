/**
 * @authbound/server/hono
 *
 * Hono specific exports for the Authbound Server SDK.
 * Provides middleware, API handlers, and utilities for identity/age verification.
 *
 * Works with Hono on any runtime: Node.js, Bun, Deno, Cloudflare Workers, etc.
 *
 * @example
 * ```ts
 * import { Hono } from 'hono';
 * import { authboundMiddleware, createAuthboundApp } from '@authbound/server/hono';
 *
 * const app = new Hono();
 *
 * // Protect routes with age verification
 * app.use('/adult-content/*', authboundMiddleware({
 *   apiKey: process.env.AUTHBOUND_API_KEY!,
 *   secret: process.env.AUTHBOUND_SECRET!,
 *   routes: {
 *     protected: [
 *       { path: '/', requirements: { minAge: 18 } },
 *     ],
 *     verify: '/verify',
 *   },
 * }));
 *
 * // Mount API routes
 * app.route('/api/authbound', createAuthboundApp(config, {
 *   onWebhook: async (event) => {
 *     console.log('Webhook received:', event);
 *   },
 * }));
 *
 * export default app;
 * ```
 */

// Middleware
export {
  authboundMiddleware,
  withAuthbound,
  type HonoMiddlewareOptions,
} from "./middleware";

// API App & Handlers
export {
  createAuthboundApp,
  createSessionHandler,
  createWebhookHandler,
  createStatusHandler,
  createSignOutHandler,
  type HandlersOptions,
} from "./handlers";

// Cookie Utilities
export {
  getCookieName,
  getCookieValue,
  getSessionFromCookie,
  setSessionCookie,
  clearSessionCookie,
  buildCookieOptions,
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
  // Webhook types
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
