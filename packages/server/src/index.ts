/**
 * @authbound/server
 *
 * Server-side SDK for Authbound identity and age verification.
 *
 * This package provides:
 * - AuthboundClient for API calls (verification creation, status querying)
 * - JWT token management for verification cookies
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
 *   apiKey: process.env.AUTHBOUND_SECRET_KEY!,
 * });
 *
 * const verification = await client.verifications.create({
 *   policyId: 'pol_authbound_pension_v1',
 *   customerUserRef: 'user_123',
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
  claimsToVerificationContext,
  createToken,
  getVerificationFromToken,
  isTokenExpired,
  refreshToken,
  verifyToken,
} from "./core/jwt";
// Core Types
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
  mapVerificationEventStatusToVerificationStatus,
  ProtectedRouteConfigSchema,
  parseConfig,
  RoutesConfigSchema,
  SexSchema,
  VerificationEventObjectSchema,
  VerificationEventStatusSchema,
  VerificationRequirementsSchema,
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
  type CancelVerificationOptions,
  type CreateCredentialDefinitionOptions,
  type CreateOpenId4VcIssuanceOfferOptions,
  type CreateVerificationOptions,
  type CredentialDefinition,
  type CredentialDefinitionClaim,
  type CredentialDefinitionClaimInput,
  type CredentialDefinitionList,
  // Standalone functions
  createVerification,
  type GetVerificationStatusOptions,
  getVerificationStatus,
  type ListOpenId4VcIssuanceOptions,
  type ListVerificationsOptions,
  type OpenId4VcIssuanceCredential,
  type OpenId4VcIssuanceList,
  type OpenId4VcIssuanceOffer,
  type OpenId4VcIssuanceStatus,
  type PublicCredentialFormat,
  type PublicVerificationStatus,
  type SignedVerificationResult,
  type UpdateCredentialDefinitionOptions,
  type UpdateOpenId4VcIssuanceOptions,
  type Verification,
  type VerificationList,
  type VerificationStatus as ApiVerificationStatus,
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
