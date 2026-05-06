/**
 * Verification types for EUDI wallet verification flows.
 *
 * These types model the verification lifecycle for wallet-based
 * identity verification (QR code scan → wallet presentation → verified).
 */

import { z } from "zod";
import {
  type ClientToken,
  isPolicyId,
  isVerificationId,
  type PolicyId,
  type VerificationId,
} from "./branded";

// ============================================================================
// Verification Status
// ============================================================================

/**
 * Verification status.
 *
 * State machine: idle → pending → processing → verified/failed/timeout/error
 *
 * - idle: Initial state, no verification started
 * - pending: Waiting for user to scan QR / open wallet
 * - processing: Wallet presentation received, validating
 * - verified: Verification successful
 * - failed: Verification failed (user rejected, credentials invalid, etc.)
 * - timeout: Verification expired without response
 * - error: Unexpected error occurred
 */
export type EudiVerificationStatus =
  | "idle"
  | "pending"
  | "processing"
  | "verified"
  | "failed"
  | "canceled"
  | "expired"
  | "timeout"
  | "error";

export const EudiVerificationStatusSchema = z.enum([
  "idle",
  "pending",
  "processing",
  "verified",
  "failed",
  "canceled",
  "expired",
  "timeout",
  "error",
]);

/**
 * Terminal states where verification flow has ended.
 */
export const TERMINAL_STATUSES: readonly EudiVerificationStatus[] = [
  "verified",
  "failed",
  "canceled",
  "expired",
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
// Verification Verdict
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

// ============================================================================
// Verification Request/Response Types
// ============================================================================

/**
 * Verification creation request.
 */
export interface CreateVerificationOptions {
  /** Policy to verify against */
  policyId: PolicyId;
  /** Optional reference to your user (for webhooks) */
  customerUserRef?: string;
  /** Optional metadata for your records */
  metadata?: Record<string, string>;
  /** Optional provider override */
  provider?: "auto" | "vcs" | "eudi";
  /** Override default timeout (seconds) */
  timeoutSeconds?: number;
}

export const CreateVerificationOptionsSchema = z.object({
  policyId: z.string().refine(isPolicyId, "Invalid policy ID"),
  customerUserRef: z.string().optional(),
  metadata: z.record(z.string(), z.string()).optional(),
  provider: z.enum(["auto", "vcs", "eudi"]).optional(),
  timeoutSeconds: z.number().int().positive().max(600).optional(),
});

/**
 * Verification creation response from your server route.
 */
export interface CreateVerificationResponse {
  /** Unique verification identifier */
  verificationId: VerificationId;
  /** URL for wallet to initiate verification (encode in QR) */
  authorizationRequestUrl: string;
  /** Short-lived token for client-side status polling */
  clientToken: ClientToken;
  /** When the session expires */
  expiresAt: string;
  /** Deep link for mobile */
  deepLink?: string;
}

export const CreateVerificationResponseSchema = z.object({
  verificationId: z
    .string()
    .refine(isVerificationId, "Invalid verification ID"),
  authorizationRequestUrl: z.string().url(),
  clientToken: z.string(),
  expiresAt: z.string(),
  deepLink: z.string().optional(),
});

/**
 * Browser session finalization response from your server route.
 */
export interface FinalizeVerificationResponse {
  /** Whether the server created a verified session */
  isVerified: boolean;
  /** Verification identifier that was finalized */
  verificationId: VerificationId;
  /** Final verification status observed by the server */
  status: EudiVerificationStatus;
}

export const FinalizeVerificationResponseSchema = z.object({
  isVerified: z.boolean(),
  verificationId: z
    .string()
    .refine(isVerificationId, "Invalid verification ID"),
  status: EudiVerificationStatusSchema,
});

/**
 * Verification status response.
 */
export interface VerificationStatusResponse {
  /** Current status */
  status: EudiVerificationStatus;
  /** Error details if failed */
  error?: {
    code: string;
    message: string;
  };
  /** Seconds remaining until timeout */
  timeRemaining?: number;
}

export const VerificationStatusResponseSchema = z.object({
  status: EudiVerificationStatusSchema,
  error: z
    .object({
      code: z.string(),
      message: z.string(),
    })
    .optional(),
  timeRemaining: z.number().optional(),
});

/**
 * Browser-safe success callback payload.
 */
export interface VerificationSuccess {
  /** Verification that reached the verified state */
  verificationId: VerificationId;
  /** Confirmed terminal success status */
  status: "verified";
}

// ============================================================================
// SSE Event Types
// ============================================================================

/**
 * Server-Sent Event from status subscription.
 */
export interface StatusEvent {
  /** Event type */
  type: "status" | "error" | "timeout" | "canceled" | "expired" | "heartbeat";
  /** Current status */
  status: EudiVerificationStatus;
  /** Error details (if type is "error") */
  error?: {
    code: string;
    message: string;
  };
  /** Server timestamp */
  timestamp: string;
}

export const StatusEventSchema = z.object({
  type: z.enum([
    "status",
    "error",
    "timeout",
    "canceled",
    "expired",
    "heartbeat",
  ]),
  status: EudiVerificationStatusSchema,
  error: z
    .object({
      code: z.string(),
      message: z.string(),
    })
    .optional(),
  timestamp: z.string(),
});
