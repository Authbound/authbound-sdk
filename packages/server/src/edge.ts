/**
 * @authbound/server/edge
 *
 * Edge-compatible exports for the Authbound Server SDK.
 * These utilities can run in Edge Runtime environments (Cloudflare Workers, Vercel Edge, etc.)
 *
 * @example
 * ```ts
 * import { verifyToken, createToken } from '@authbound/server/edge';
 * ```
 */

// Re-export edge-compatible JWT utilities
export {
  type CreateTokenOptions,
  claimsToSession,
  createToken,
  getSessionFromToken,
  isTokenExpired,
  refreshToken,
  verifyToken,
} from "./core/jwt";

// Re-export types
export type {
  AssuranceLevel,
  AuthboundClaims,
  AuthboundSession,
  VerificationStatus,
} from "./core/types";

// Re-export utilities
export { calculateAge, checkRequirements } from "./core/types";
