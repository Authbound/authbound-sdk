/**
 * @authbound/server
 *
 * Server-side SDK for Authbound identity and age verification.
 *
 * This package provides:
 * - Framework-agnostic core utilities
 * - JWT token management for verification sessions
 * - Configuration types and validation
 *
 * For framework-specific integrations, import from the appropriate subpath:
 * - `@authbound/server/next` - Next.js middleware and handlers
 *
 * @example
 * ```ts
 * // Core utilities
 * import { createToken, verifyToken } from '@authbound/server';
 *
 * // Next.js specific
 * import { authboundMiddleware, createAuthboundHandlers } from '@authbound/server/next';
 * ```
 */

// Core Types
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
  WebhookPayload,
  CreateSessionResponse,
  SessionStatusResponse,
  MiddlewareResult,
} from "./core/types";

// Core Utilities
export {
  parseConfig,
  checkRequirements,
  calculateAge,
  getDefaultCookieOptions,
  VerificationStatusSchema,
  AssuranceLevelSchema,
  VerificationRequirementsSchema,
  ProtectedRouteConfigSchema,
  CookieOptionsSchema,
  RoutesConfigSchema,
  AuthboundConfigSchema,
  AuthboundClaimsSchema,
  WebhookPayloadSchema,
} from "./core/types";

// JWT Utilities
export {
  createToken,
  verifyToken,
  getSessionFromToken,
  refreshToken,
  isTokenExpired,
  claimsToSession,
  type CreateTokenOptions,
} from "./core/jwt";

// Error Utilities
export {
  sanitizeError,
  logError,
  createSafeErrorResponse,
  type SanitizedError,
} from "./core/error-utils";
