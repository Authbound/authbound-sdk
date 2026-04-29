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
 *   apiKey: process.env.AUTHBOUND_SECRET_KEY!,
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

// Re-export error utilities
export {
  createSafeErrorResponse,
  logError,
  type SanitizedError,
  sanitizeError,
} from "../core/error-utils";
// Re-export JWT utilities for advanced use cases
export {
  claimsToVerificationContext,
  createToken,
  getVerificationFromToken,
  isTokenExpired,
  refreshToken,
  verifyToken,
} from "../core/jwt";
// Re-export core types for convenience
export type {
  AssuranceLevel,
  AuthboundClaims,
  AuthboundConfig,
  AuthboundVerificationContext,
  CookieOptions,
  CreateVerificationResponse,
  Dob,
  LastError,
  MiddlewareResult,
  ProtectedRouteConfig,
  RoutesConfig,
  Sex,
  VerificationEventObject,
  VerificationEventStatus,
  VerificationRequirements,
  VerificationStatus,
  VerificationStatusResponse,
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
  buildCookieOptions,
  clearVerificationCookie,
  getCookieName,
  getCookieValue,
  getVerificationFromCookie,
  type SetVerificationCookieOptions,
  setVerificationCookie,
} from "./cookies";
// API App & Handlers
export {
  createAuthboundApp,
  createSignOutHandler,
  createStatusHandler,
  createVerificationHandler,
  createWebhookHandler,
  type HandlersOptions,
} from "./handlers";
// Middleware
export {
  authboundMiddleware,
  type HonoMiddlewareOptions,
  withAuthbound,
} from "./middleware";
