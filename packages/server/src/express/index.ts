/**
 * @authbound/server/express
 *
 * Express.js specific exports for the Authbound Server SDK.
 * Provides middleware, API handlers, and utilities for identity/age verification.
 *
 * @example
 * ```ts
 * import express from 'express';
 * import cookieParser from 'cookie-parser';
 * import { authboundMiddleware, createAuthboundRouter } from '@authbound/server/express';
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

// Middleware
export {
  authboundMiddleware,
  withAuthbound,
  type ExpressMiddlewareOptions,
  type AuthboundMiddleware,
} from "./middleware";

// API Router & Handlers
export {
  createAuthboundRouter,
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
