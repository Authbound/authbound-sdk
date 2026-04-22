/**
 * @authbound-sdk/server
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
 * - `@authbound-sdk/server/next` - Next.js middleware and handlers
 * - `@authbound-sdk/server/express` - Express.js middleware and handlers
 * - `@authbound-sdk/server/hono` - Hono middleware and handlers
 *
 * @example
 * ```ts
 * // API Client (manual orchestration)
 * import { AuthboundClient } from '@authbound-sdk/server';
 *
 * const client = new AuthboundClient({
 *   apiKey: process.env.AUTHBOUND_API_KEY!,
 * });
 *
 * const verification = await client.verifications.create({
 *   policyId: 'pol_authbound_pension_v1',
 *   customerUserRef: 'user_123',
 * });
 *
 * // Webhook verification
 * import { verifyWebhookSignature } from '@authbound-sdk/server';
 *
 * const isValid = verifyWebhookSignature({
 *   payload: rawBody,
 *   signature: req.headers['x-authbound-signature'],
 *   secret: process.env.AUTHBOUND_WEBHOOK_SECRET!,
 * });
 *
 * // Framework-specific
 * import { authboundMiddleware } from '@authbound-sdk/server/express';
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
  VerificationRequirements,
  VerificationEventObject,
  VerificationEventStatus,
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
  VerificationRequirementsSchema,
  VerificationEventObjectSchema,
  VerificationEventStatusSchema,
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
  getVerificationStatus,
  type GetVerificationStatusOptions,
  type ListOpenId4VcIssuanceOptions,
  type ListVerificationsOptions,
  type OpenId4VcIssuanceCredential,
  type OpenId4VcIssuanceList,
  type OpenId4VcIssuanceOffer,
  type OpenId4VcIssuanceStatus,
  type PublicVerificationStatus,
  type PublicCredentialFormat,
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
