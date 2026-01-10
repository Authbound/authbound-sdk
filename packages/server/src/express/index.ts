/**
 * @authbound-sdk/server/express
 *
 * Express.js specific exports for the Authbound Server SDK.
 * Provides middleware, API handlers, and utilities for identity/age verification.
 *
 * @example
 * ```ts
 * import express from 'express';
 * import cookieParser from 'cookie-parser';
 * import { authboundMiddleware, createAuthboundRouter } from '@authbound-sdk/server/express';
 *
 * const app = express();
 * app.use(express.json());
 * app.use(cookieParser());
 *
 * // Protect routes with age verification
 * app.use('/adult-content', authboundMiddleware({
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
 * app.use('/api/authbound', createAuthboundRouter(config, {
 *   onWebhook: async (event) => {
 *     console.log('Webhook received:', event);
 *   },
 * }));
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
  buildCookieOptions,
  clearSessionCookie,
  getCookieName,
  getCookieValue,
  getSessionFromCookie,
  type SetSessionCookieOptions,
  setSessionCookie,
} from "./cookies";
// API Router & Handlers
export {
  createAuthboundRouter,
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
  type ExpressMiddlewareOptions,
  withAuthbound,
} from "./middleware";
