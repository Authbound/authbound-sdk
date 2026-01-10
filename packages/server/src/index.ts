/**
 * @authbound/server
 *
 * Server-side SDK for Authbound identity and age verification.
 *
 * This package provides:
 * - AuthboundClient for API calls (session creation, status querying)
 * - JWT token management for verification sessions
 * - Webhook signature verification
 * - Framework-agnostic core utilities
 *
 * For framework-specific integrations, import from the appropriate subpath:
 * - `@authbound/server/next` - Next.js middleware and handlers
 * - `@authbound/server/express` - Express.js middleware and handlers
 * - `@authbound/server/hono` - Hono middleware and handlers
 *
 * @example
 * ```ts
 * // API Client (manual orchestration)
 * import { AuthboundClient } from '@authbound/server';
 *
 * const client = new AuthboundClient({
 *   apiKey: process.env.AUTHBOUND_API_KEY!,
 * });
 *
 * const session = await client.sessions.create({
 *   userRef: 'user_123',
 *   callbackUrl: 'https://example.com/webhook',
 * });
 *
 * // Webhook verification
 * import { verifyWebhookSignature } from '@authbound/server';
 *
 * const isValid = verifyWebhookSignature({
 *   payload: rawBody,
 *   signature: req.headers['x-authbound-signature'],
 *   secret: process.env.AUTHBOUND_WEBHOOK_SECRET!,
 * });
 *
 * // Framework-specific
 * import { authboundMiddleware } from '@authbound/server/express';
 * ```
 */

// Error Utilities
export {
  createSafeErrorResponse,
  logError,
  type SanitizedError,
  sanitizeError,
} from "./core/error-utils";
// JWT Utilities
export {
  type CreateTokenOptions,
  claimsToSession,
  createToken,
  getSessionFromToken,
  isTokenExpired,
  refreshToken,
  verifyToken,
} from "./core/jwt";
// Core Types
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
} from "./core/types";
// Core Utilities
export {
  AssuranceLevelSchema,
  AuthboundClaimsSchema,
  AuthboundConfigSchema,
  CookieOptionsSchema,
  calculateAge,
  calculateAgeFromDob,
  checkRequirements,
  DobSchema,
  getDefaultCookieOptions,
  LastErrorSchema,
  mapSessionStatusToVerificationStatus,
  ProtectedRouteConfigSchema,
  parseConfig,
  RoutesConfigSchema,
  SexSchema,
  VerificationRequirementsSchema,
  VerificationSessionObjectSchema,
  VerificationSessionStatusSchema,
  VerificationStatusSchema,
  VerifiedOutputsSchema,
  // Webhook schemas
  WebhookEventSchema,
  WebhookEventTypeSchema,
} from "./core/types";

// ============================================================================
// API Client (Manual Orchestration)
// ============================================================================

export {
  // Client class
  AuthboundClient,
  // Types
  type AuthboundClientConfig,
  AuthboundClientError,
  type CreateSessionOptions,
  type CreateSessionResult,
  // Standalone functions
  createSession,
  type GetSessionResult,
  getSessionStatus,
  type VerifySignatureOptions,
} from "./core/client";

// ============================================================================
// Webhook Verification
// ============================================================================

export {
  generateWebhookSignature,
  verifyWebhookSignature,
  verifyWebhookSignatureDetailed,
  type WebhookSignatureOptions,
  type WebhookSignatureResult,
} from "./core/webhooks";
