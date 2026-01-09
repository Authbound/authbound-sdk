/**
 * Verification types for EUDI wallet verification flows.
 *
 * These types model the verification lifecycle for wallet-based
 * identity verification (QR code scan → wallet presentation → verified).
 */

import { z } from "zod";
import type { PolicyId, SessionId, ClientToken } from "./branded";

// ============================================================================
// Verification Status
// ============================================================================

/**
 * Verification session status.
 *
 * State machine: idle → pending → processing → verified/failed/timeout/error
 *
 * - idle: Initial state, no verification started
 * - pending: Waiting for user to scan QR / open wallet
 * - processing: Wallet presentation received, validating
 * - verified: Verification successful
 * - failed: Verification failed (user rejected, credentials invalid, etc.)
 * - timeout: Session expired without response
 * - error: Unexpected error occurred
 */
export type EudiVerificationStatus =
  | "idle"
  | "pending"
  | "processing"
  | "verified"
  | "failed"
  | "timeout"
  | "error";

export const EudiVerificationStatusSchema = z.enum([
  "idle",
  "pending",
  "processing",
  "verified",
  "failed",
  "timeout",
  "error",
]);

/**
 * Terminal states where verification flow has ended.
 */
export const TERMINAL_STATUSES: readonly EudiVerificationStatus[] = [
  "verified",
  "failed",
  "timeout",
  "error",
] as const;

/**
 * Check if a status is terminal (verification flow has ended).
 */
export function isTerminalStatus(status: EudiVerificationStatus): boolean {
  return TERMINAL_STATUSES.includes(status);
}

// ============================================================================
// Verification Result
// ============================================================================

/**
 * Verdict from verification - the final decision.
 */
export type Verdict = "approved" | "rejected" | "inconclusive";

export const VerdictSchema = z.enum(["approved", "rejected", "inconclusive"]);

/**
 * Boolean claims from verified credentials.
 * These are safe to store in cookies (no PII).
 */
export interface VerificationClaims {
  /** User is at least 18 years old */
  age_over_18?: boolean;
  /** User is at least 21 years old */
  age_over_21?: boolean;
  /** User is at least 65 years old */
  age_over_65?: boolean;
  /** User holds a valid driving license */
  driving_license_valid?: boolean;
  /** User is a resident of an EU member state */
  eu_resident?: boolean;
}

export const VerificationClaimsSchema = z.object({
  age_over_18: z.boolean().optional(),
  age_over_21: z.boolean().optional(),
  age_over_65: z.boolean().optional(),
  driving_license_valid: z.boolean().optional(),
  eu_resident: z.boolean().optional(),
});

/**
 * Extended attributes from verification (server-side only).
 * Contains PII - never send to client or store in cookies.
 */
export interface VerificationAttributes {
  /** Full name */
  full_name?: string;
  /** Given names */
  given_name?: string;
  /** Family name */
  family_name?: string;
  /** Date of birth (ISO 8601 date) */
  birth_date?: string;
  /** Calculated age in years */
  age?: number;
  /** Nationality (ISO 3166-1 alpha-2) */
  nationality?: string;
  /** Country of residence (ISO 3166-1 alpha-2) */
  resident_country?: string;
  /** Driving license categories (e.g., ["B", "A1"]) */
  driving_privileges?: string[];
  /** Raw credential data (provider-specific) */
  raw?: Record<string, unknown>;
}

export const VerificationAttributesSchema = z.object({
  full_name: z.string().optional(),
  given_name: z.string().optional(),
  family_name: z.string().optional(),
  birth_date: z.string().optional(),
  age: z.number().int().nonnegative().optional(),
  nationality: z.string().length(2).optional(),
  resident_country: z.string().length(2).optional(),
  driving_privileges: z.array(z.string()).optional(),
  raw: z.record(z.string(), z.unknown()).optional(),
});

/**
 * Complete verification result.
 */
export interface VerificationResult {
  /** Final verdict */
  verdict: Verdict;
  /** Boolean claims (safe for client) */
  claims: VerificationClaims;
  /** Full attributes (server-only, PII) */
  attributes?: VerificationAttributes;
  /** Credential types that were presented */
  credential_types?: string[];
  /** Timestamp of verification */
  verified_at?: string;
}

export const VerificationResultSchema = z.object({
  verdict: VerdictSchema,
  claims: VerificationClaimsSchema,
  attributes: VerificationAttributesSchema.optional(),
  credential_types: z.array(z.string()).optional(),
  verified_at: z.string().optional(),
});

// ============================================================================
// Session Types
// ============================================================================

/**
 * Session creation request.
 */
export interface CreateSessionRequest {
  /** Policy to verify against */
  policyId: PolicyId;
  /** Optional reference to your user (for webhooks) */
  customerUserRef?: string;
  /** Optional metadata for your records */
  metadata?: Record<string, string>;
  /** Override default timeout (seconds) */
  timeoutSeconds?: number;
}

export const CreateSessionRequestSchema = z.object({
  policyId: z.string().regex(/^.+@.+$/, "Policy ID must include version"),
  customerUserRef: z.string().optional(),
  metadata: z.record(z.string(), z.string()).optional(),
  timeoutSeconds: z.number().int().positive().max(600).optional(),
});

/**
 * Session creation response from Gateway.
 */
export interface CreateSessionResponse {
  /** Unique session identifier */
  sessionId: SessionId;
  /** URL for wallet to initiate verification (encode in QR) */
  authorizationRequestUrl: string;
  /** Short-lived token for client-side status polling */
  clientToken: ClientToken;
  /** When the session expires */
  expiresAt: string;
  /** Deep link for mobile */
  deepLink?: string;
}

export const CreateSessionResponseSchema = z.object({
  sessionId: z.string().startsWith("ses_"),
  authorizationRequestUrl: z.string().url(),
  clientToken: z.string(),
  expiresAt: z.string(),
  deepLink: z.string().optional(),
});

/**
 * Session status response.
 */
export interface SessionStatusResponse {
  /** Current status */
  status: EudiVerificationStatus;
  /** Result if verification completed */
  result?: VerificationResult;
  /** Error details if failed */
  error?: {
    code: string;
    message: string;
  };
  /** Seconds remaining until timeout */
  timeRemaining?: number;
}

export const SessionStatusResponseSchema = z.object({
  status: EudiVerificationStatusSchema,
  result: VerificationResultSchema.optional(),
  error: z
    .object({
      code: z.string(),
      message: z.string(),
    })
    .optional(),
  timeRemaining: z.number().optional(),
});

// ============================================================================
// SSE Event Types
// ============================================================================

/**
 * Server-Sent Event from status subscription.
 */
export interface StatusEvent {
  /** Event type */
  type: "status" | "result" | "error" | "timeout" | "heartbeat";
  /** Current status */
  status: EudiVerificationStatus;
  /** Result data (if type is "result") */
  result?: VerificationResult;
  /** Error details (if type is "error") */
  error?: {
    code: string;
    message: string;
  };
  /** Server timestamp */
  timestamp: string;
}

export const StatusEventSchema = z.object({
  type: z.enum(["status", "result", "error", "timeout", "heartbeat"]),
  status: EudiVerificationStatusSchema,
  result: VerificationResultSchema.optional(),
  error: z
    .object({
      code: z.string(),
      message: z.string(),
    })
    .optional(),
  timestamp: z.string(),
});
