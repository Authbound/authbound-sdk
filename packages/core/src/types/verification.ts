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
// Provider Options
// ============================================================================

const EudiExpectedOriginSchema = z.string().url().refine(
  (value) => {
    try {
      const url = new URL(value);
      return (
        url.protocol === "https:" &&
        url.hostname.length > 0 &&
        url.username === "" &&
        url.password === "" &&
        (url.pathname === "" || url.pathname === "/") &&
        url.search === "" &&
        url.hash === ""
      );
    } catch {
      return false;
    }
  },
  {
    message:
      "expectedOrigins entries must be HTTPS origins without userinfo, path, query, or fragment",
  }
);

const AUTHORIZATION_REQUEST_SCHEME_PATTERN = /^[A-Za-z][A-Za-z0-9+.-]*$/;
const DISALLOWED_AUTHORIZATION_REQUEST_SCHEMES = new Set([
  "about",
  "blob",
  "data",
  "file",
  "javascript",
  "vbscript",
]);
const RESERVED_AUTHORIZATION_REQUEST_URI_PARAMS = new Set([
  "client_id",
  "request",
  "request_uri",
  "request_uri_method",
]);

function isDisallowedAuthorizationRequestScheme(scheme: string): boolean {
  return DISALLOWED_AUTHORIZATION_REQUEST_SCHEMES.has(
    scheme.toLowerCase().replace(/:$/, "")
  );
}

function hasReservedAuthorizationRequestUriParam(value: string): boolean {
  try {
    const url = new URL(value);
    let hasReservedParam = false;
    url.searchParams.forEach((_paramValue, key) => {
      if (RESERVED_AUTHORIZATION_REQUEST_URI_PARAMS.has(key)) {
        hasReservedParam = true;
      }
    });
    return hasReservedParam;
  } catch {
    return true;
  }
}

function hasDisallowedAuthorizationRequestUriScheme(value: string): boolean {
  try {
    return isDisallowedAuthorizationRequestScheme(new URL(value).protocol);
  } catch {
    return true;
  }
}

const AuthorizationRequestUriSchema = z
  .string()
  .url()
  .refine((value) => !hasDisallowedAuthorizationRequestUriScheme(value), {
    message:
      "authorizationRequestUri must not use a browser-executable or local file scheme",
  })
  .refine((value) => !hasReservedAuthorizationRequestUriParam(value), {
    message:
      "authorizationRequestUri must not contain client_id, request, request_uri, or request_uri_method query parameters",
  });

export const EudiVerifierAttestationSchema = z
  .object({
    format: z.literal("jwt"),
    data: z.string().refine((value) => value.trim().length > 0, {
      message: "Verifier attestation data cannot be blank",
    }),
  })
  .strict();

export type EudiVerifierAttestation = z.infer<
  typeof EudiVerifierAttestationSchema
>;

export const EudiVerificationOptionsSchema = z
  .object({
    responseMode: z
      .enum(["direct_post", "direct_post.jwt", "dc_api.jwt"])
      .optional(),
    expectedOrigins: z.array(EudiExpectedOriginSchema).min(1).optional(),
    jarMode: z.enum(["by_value", "by_reference"]).optional(),
    requestUriMethod: z.enum(["get", "post"]).optional(),
    authorizationRequestScheme: z
      .string()
      .regex(
        AUTHORIZATION_REQUEST_SCHEME_PATTERN,
        "authorizationRequestScheme must be a valid URI scheme"
      )
      .refine((value) => !isDisallowedAuthorizationRequestScheme(value), {
        message:
          "authorizationRequestScheme must not be a browser-executable or local file scheme",
      })
      .optional(),
    authorizationRequestUri: AuthorizationRequestUriSchema.optional(),
    stripTrustedAuthoritiesForWallet: z.boolean().optional(),
    verifierAttestations: z
      .array(EudiVerifierAttestationSchema)
      .min(1)
      .optional(),
    profile: z.enum(["openid4vp", "haip"]).optional(),
  })
  .strict()
  .superRefine((options, context) => {
    if (
      options.responseMode === "dc_api.jwt" &&
      !options.expectedOrigins?.length
    ) {
      context.addIssue({
        code: "custom",
        path: ["expectedOrigins"],
        message: "expectedOrigins is required when responseMode is dc_api.jwt",
      });
    }
    if (options.authorizationRequestScheme && options.authorizationRequestUri) {
      context.addIssue({
        code: "custom",
        path: ["authorizationRequestUri"],
        message:
          "authorizationRequestScheme and authorizationRequestUri are mutually exclusive",
      });
    }
  });

export type EudiVerificationOptions = z.infer<
  typeof EudiVerificationOptionsSchema
>;

export const VerificationProviderOptionsSchema = z
  .object({
    eudi: EudiVerificationOptionsSchema.optional(),
  })
  .strict();

export type VerificationProviderOptions = z.infer<
  typeof VerificationProviderOptionsSchema
>;

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
  metadata?: Record<string, unknown>;
  /** Optional provider override */
  provider?: ProviderPreference;
  /** Provider-specific protocol options */
  providerOptions?: VerificationProviderOptions;
  /** Override default timeout (seconds) */
  timeoutSeconds?: number;
}

export const CreateVerificationOptionsSchema = z.object({
  policyId: z.string().refine(isPolicyId, "Invalid policy ID"),
  customerUserRef: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  provider: ProviderPreferenceSchema.optional(),
  providerOptions: VerificationProviderOptionsSchema.optional(),
  timeoutSeconds: z.number().int().positive().max(600).optional(),
});

export type WalletHandoffKind = "qr" | "link" | "request_blob" | "dc_api";

export const WalletHandoffKindSchema = z.enum([
  "qr",
  "link",
  "request_blob",
  "dc_api",
]);

/**
 * Verification creation response from your server route.
 */
export interface CreateVerificationResponse {
  /** Unique verification identifier */
  verificationId: VerificationId;
  /** Wallet handoff payload to encode in QR */
  authorizationRequestUrl: string;
  /** Short-lived token for client-side status polling */
  clientToken: ClientToken;
  /** When the session expires */
  expiresAt: string;
  /** Deep link for mobile */
  deepLink?: string;
  /** Handoff kind returned by Authbound client_action */
  walletHandoffKind?: WalletHandoffKind;
}

export const CreateVerificationResponseSchema = z.object({
  verificationId: z
    .string()
    .refine(isVerificationId, "Invalid verification ID"),
  authorizationRequestUrl: z.string().min(1),
  clientToken: z.string(),
  expiresAt: z.string(),
  deepLink: z.string().optional(),
  walletHandoffKind: WalletHandoffKindSchema.optional(),
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
