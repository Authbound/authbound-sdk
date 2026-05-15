/**
 * Verification types for wallet-based verification flows.
 *
 * These types model the verification lifecycle from wallet handoff through
 * terminal verification status.
 */

import { z } from "zod";
import {
  type ClientToken,
  isPolicyId,
  isVerificationId,
  type PolicyId,
  type VerificationId,
} from "./branded";
import {
  isTerminalVerificationUiStatus,
  type ProviderPreference,
  ProviderPreferenceSchema,
  TERMINAL_VERIFICATION_UI_STATUSES,
  type VerificationUiStatus,
  VerificationUiStatusSchema,
} from "./verification-contract";

// ============================================================================
// Verification Status
// ============================================================================

/**
 * Terminal states where verification flow has ended.
 */
export const TERMINAL_STATUSES: readonly VerificationUiStatus[] =
  TERMINAL_VERIFICATION_UI_STATUSES;

/**
 * Check if a status is terminal (verification flow has ended).
 */
export function isTerminalStatus(status: VerificationUiStatus): boolean {
  return isTerminalVerificationUiStatus(status);
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
}

export const VerificationClaimsSchema = z
  .object({
    age_over_18: z.boolean().optional(),
  })
  .strict();

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
  provider?: ProviderPreference;
  /** Override default timeout (seconds) */
  timeoutSeconds?: number;
}

export const CreateVerificationOptionsSchema = z.object({
  policyId: z.string().refine(isPolicyId, "Invalid policy ID"),
  customerUserRef: z.string().optional(),
  metadata: z.record(z.string(), z.string()).optional(),
  provider: ProviderPreferenceSchema.optional(),
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
  status: VerificationUiStatus;
}

export const FinalizeVerificationResponseSchema = z.object({
  isVerified: z.boolean(),
  verificationId: z
    .string()
    .refine(isVerificationId, "Invalid verification ID"),
  status: VerificationUiStatusSchema,
});

/**
 * Verification status response.
 */
export interface VerificationStatusResponse {
  /** Current status */
  status: VerificationUiStatus;
  /** Error details if failed */
  error?: {
    code: string;
    message: string;
  };
  /** Seconds remaining until timeout */
  timeRemaining?: number;
}

export const VerificationStatusResponseSchema = z.object({
  status: VerificationUiStatusSchema,
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
  status: VerificationUiStatus;
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
  status: VerificationUiStatusSchema,
  error: z
    .object({
      code: z.string(),
      message: z.string(),
    })
    .optional(),
  timestamp: z.string(),
});
