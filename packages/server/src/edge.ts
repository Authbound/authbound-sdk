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
  createToken,
  verifyToken,
  getSessionFromToken,
  refreshToken,
  isTokenExpired,
  claimsToSession,
  type CreateTokenOptions,
} from "./core/jwt";

// Re-export types
export type {
  AuthboundClaims,
  AuthboundSession,
  VerificationStatus,
  AssuranceLevel,
} from "./core/types";

// Re-export utilities
export { calculateAge, checkRequirements } from "./core/types";

