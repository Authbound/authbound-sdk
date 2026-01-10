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
} from "./core/types";

// Core Utilities
export {
  parseConfig,
  checkRequirements,
  calculateAge,
  calculateAgeFromDob,
  mapSessionStatusToVerificationStatus,
  getDefaultCookieOptions,
  VerificationStatusSchema,
  AssuranceLevelSchema,
  VerificationRequirementsSchema,
  ProtectedRouteConfigSchema,
  CookieOptionsSchema,
  RoutesConfigSchema,
  AuthboundConfigSchema,
  AuthboundClaimsSchema,
  // Webhook schemas
  WebhookEventSchema,
  WebhookEventTypeSchema,
  VerificationSessionObjectSchema,
  VerificationSessionStatusSchema,
  VerifiedOutputsSchema,
  LastErrorSchema,
  DobSchema,
  SexSchema,
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

// ============================================================================
// API Client (Manual Orchestration)
// ============================================================================

export {
  // Client class
  AuthboundClient,
  AuthboundClientError,
  // Standalone functions
  createSession,
  getSessionStatus,
  // Types
  type AuthboundClientConfig,
  type CreateSessionOptions,
  type CreateSessionResult,
  type GetSessionResult,
  type VerifySignatureOptions,
} from "./core/client";

// ============================================================================
// Webhook Verification
// ============================================================================

export {
  verifyWebhookSignature,
  verifyWebhookSignatureDetailed,
  generateWebhookSignature,
  type WebhookSignatureOptions,
  type WebhookSignatureResult,
} from "./core/webhooks";
