/**
 * @authbound-sdk/server/edge
 *
 * Edge-compatible exports for the Authbound Server SDK.
 * These utilities can run in Edge Runtime environments (Cloudflare Workers, Vercel Edge, etc.)
 *
 * @example
 * ```ts
 * import { verifyToken, createToken } from '@authbound-sdk/server/edge';
 * ```
 */

// Re-export edge-compatible JWT utilities
export {
  type CreateTokenOptions,
  claimsToVerificationContext,
  createToken,
  getVerificationFromToken,
  isTokenExpired,
  refreshToken,
  verifyToken,
} from "./core/jwt";

// Re-export types
export type {
  AssuranceLevel,
  AuthboundClaims,
  AuthboundVerificationContext,
  VerificationStatus,
} from "./core/types";

// Re-export utilities
export { calculateAge, checkRequirements } from "./core/types";
