/**
 * JWT token types for Authbound verification.
 *
 * All tokens use EdDSA (Ed25519) for Edge runtime compatibility.
 */

import { z } from "zod";
import type { SessionId, PolicyId } from "./branded";
import type { VerificationClaims, Verdict } from "./verification";

// ============================================================================
// Client Token Claims
// ============================================================================

/**
 * Claims in the ephemeral client token (safe for browser).
 *
 * This token is short-lived (15 minutes) and has limited scope:
 * - Can only poll status for the associated session
 * - Cannot retrieve PII or full verification results
 */
export interface ClientTokenClaims {
  /** Token type */
  typ: "client";
  /** Subject - session ID */
  sub: SessionId;
  /** Policy being verified */
  pol: PolicyId;
  /** Issuer */
  iss: string;
  /** Audience - customer's domain */
  aud: string;
  /** Issued at (Unix timestamp) */
  iat: number;
  /** Expiration (Unix timestamp) */
  exp: number;
  /** JWT ID */
  jti: string;
}

export const ClientTokenClaimsSchema = z.object({
  typ: z.literal("client"),
  sub: z.string().startsWith("ses_"),
  pol: z.string().regex(/^.+@.+$/),
  iss: z.string(),
  aud: z.string(),
  iat: z.number(),
  exp: z.number(),
  jti: z.string(),
});

// ============================================================================
// Result Token Claims
// ============================================================================

/**
 * Claims in the result token (returned after verification).
 *
 * This token contains the verification outcome with boolean claims only.
 * PII is never included - only safe for client-side storage.
 */
export interface ResultTokenClaims {
  /** Token type */
  typ: "result";
  /** Subject - customer user reference (if provided) */
  sub?: string;
  /** Session ID */
  sid: SessionId;
  /** Policy that was verified */
  pol: PolicyId;
  /** Verification verdict */
  verdict: Verdict;
  /** Boolean claims (no PII) */
  claims: VerificationClaims;
  /** Issuer */
  iss: string;
  /** Audience - customer's domain */
  aud: string;
  /** Issued at (Unix timestamp) */
  iat: number;
  /** Expiration (Unix timestamp) - defaults to 1 hour */
  exp: number;
  /** JWT ID */
  jti: string;
}

export const ResultTokenClaimsSchema = z.object({
  typ: z.literal("result"),
  sub: z.string().optional(),
  sid: z.string().startsWith("ses_"),
  pol: z.string().regex(/^.+@.+$/),
  verdict: z.enum(["approved", "rejected", "inconclusive"]),
  claims: z.object({
    age_over_18: z.boolean().optional(),
    age_over_21: z.boolean().optional(),
    age_over_65: z.boolean().optional(),
    driving_license_valid: z.boolean().optional(),
    eu_resident: z.boolean().optional(),
  }),
  iss: z.string(),
  aud: z.string(),
  iat: z.number(),
  exp: z.number(),
  jti: z.string(),
});

// ============================================================================
// Webhook Token Claims
// ============================================================================

/**
 * Claims in webhook signature token.
 *
 * Used to verify webhook authenticity.
 */
export interface WebhookTokenClaims {
  /** Token type */
  typ: "webhook";
  /** Event ID */
  eid: string;
  /** Event type */
  evt: string;
  /** Webhook endpoint URL hash */
  eph: string;
  /** Issuer */
  iss: string;
  /** Issued at (Unix timestamp) */
  iat: number;
  /** Expiration (Unix timestamp) - 5 minutes */
  exp: number;
}

export const WebhookTokenClaimsSchema = z.object({
  typ: z.literal("webhook"),
  eid: z.string(),
  evt: z.string(),
  eph: z.string(),
  iss: z.string(),
  iat: z.number(),
  exp: z.number(),
});

// ============================================================================
// Token Configuration
// ============================================================================

/**
 * Token TTL defaults (in seconds).
 */
export const TOKEN_TTL = {
  /** Client token - 15 minutes */
  CLIENT: 15 * 60,
  /** Result token - 1 hour */
  RESULT: 60 * 60,
  /** Result cookie - 1 hour */
  COOKIE: 60 * 60,
  /** Webhook signature - 5 minutes */
  WEBHOOK: 5 * 60,
} as const;

/**
 * Token issuer for Authbound Gateway.
 */
export const TOKEN_ISSUER = "https://gateway.authbound.io";

/**
 * Cookie name for result token.
 */
export const RESULT_COOKIE_NAME = "ab_verif";
