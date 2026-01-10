/**
 * Authbound SDK error handling.
 *
 * Error codes are stable and documented - safe to use in switch statements.
 * Error messages are human-readable and safe to display to users.
 */

// ============================================================================
// Error Codes
// ============================================================================

/**
 * SDK error codes.
 *
 * Grouped by category:
 * - config_*: Configuration errors (developer mistake)
 * - policy_*: Policy resolution errors
 * - session_*: Session lifecycle errors
 * - wallet_*: Wallet interaction errors
 * - token_*: Token validation errors
 * - network_*: Network/connectivity errors
 * - internal_*: Unexpected errors
 */
export type AuthboundErrorCode =
  // Configuration errors
  | "config_missing"
  | "config_invalid"
  | "config_key_invalid"
  // Policy errors
  | "policy_not_found"
  | "policy_invalid"
  | "policy_version_required"
  // Session errors
  | "session_create_failed"
  | "session_not_found"
  | "session_expired"
  | "session_invalid_state"
  // Wallet interaction errors
  | "wallet_timeout"
  | "wallet_rejected"
  | "wallet_unsupported"
  | "presentation_invalid"
  | "presentation_rejected"
  | "credential_expired"
  | "credential_revoked"
  // Token errors
  | "token_invalid"
  | "token_expired"
  | "token_signature_invalid"
  // Network errors
  | "network_error"
  | "gateway_unavailable"
  | "rate_limited"
  // Internal errors
  | "internal_error"
  | "unknown_error";

/**
 * Documentation base URL for error pages.
 */
export const DOCS_BASE_URL = "https://docs.authbound.io";

/**
 * Error metadata including message, hint, and documentation link.
 */
export interface ErrorMetadata {
  /** Human-readable error message */
  message: string;
  /** Actionable hint for resolution */
  hint?: string;
  /** Documentation path (appended to DOCS_BASE_URL) */
  docsPath?: string;
}

/**
 * Human-readable messages and hints for each error code.
 */
export const ERROR_METADATA: Record<AuthboundErrorCode, ErrorMetadata> = {
  // Configuration
  config_missing: {
    message: "SDK configuration is missing.",
    hint: "Wrap your app with <AuthboundProvider> or call createClient() with configuration.",
    docsPath: "/errors/config-missing",
  },
  config_invalid: {
    message: "SDK configuration is invalid.",
    hint: "Check that publishableKey starts with 'pk_live_' or 'pk_test_'.",
    docsPath: "/errors/config-invalid",
  },
  config_key_invalid: {
    message: "API key format is invalid.",
    hint: "Publishable keys start with 'pk_', secret keys with 'sk_'. Get keys from the dashboard.",
    docsPath: "/errors/config-key-invalid",
  },
  // Policy
  policy_not_found: {
    message: "Verification policy not found.",
    hint: "Check the policy ID is correct and the policy exists in your account.",
    docsPath: "/errors/policy-not-found",
  },
  policy_invalid: {
    message: "Verification policy configuration is invalid.",
    hint: "Review policy requirements. Each credential must have valid attributes.",
    docsPath: "/policies/configuration",
  },
  policy_version_required: {
    message: "Policy version is required in production.",
    hint: "Use format: 'policy-name@1.0.0'. Unversioned policies are only allowed in test mode.",
    docsPath: "/policies/versioning",
  },
  // Session
  session_create_failed: {
    message: "Failed to create verification session.",
    hint: "Check your API key permissions and that the policy is enabled.",
    docsPath: "/errors/session-create-failed",
  },
  session_not_found: {
    message: "Verification session not found.",
    hint: "The session may have expired or been deleted. Create a new session with startVerification().",
    docsPath: "/errors/session-not-found",
  },
  session_expired: {
    message: "Verification session has expired.",
    hint: "Sessions expire after 5 minutes. Call startVerification() to create a new session.",
    docsPath: "/errors/session-expired",
  },
  session_invalid_state: {
    message: "Session is in an invalid state for this operation.",
    hint: "Check session.status before performing operations. Terminal states cannot be changed.",
    docsPath: "/errors/session-invalid-state",
  },
  // Wallet
  wallet_timeout: {
    message: "Wallet did not respond in time.",
    hint: "The user may not have the wallet app installed. Show a download prompt or QR code.",
    docsPath: "/errors/wallet-timeout",
  },
  wallet_rejected: {
    message: "Verification was declined by the user.",
    hint: "The user chose not to share their credentials. Respect their decision or offer alternatives.",
    docsPath: "/errors/wallet-rejected",
  },
  wallet_unsupported: {
    message: "This wallet type is not supported.",
    hint: "Check the list of supported wallets in the documentation.",
    docsPath: "/wallets/supported",
  },
  presentation_invalid: {
    message: "The presented credentials are invalid.",
    hint: "The credential signature verification failed. The credential may be tampered with.",
    docsPath: "/errors/presentation-invalid",
  },
  presentation_rejected: {
    message: "The credentials do not meet the verification requirements.",
    hint: "Review the policy requirements. The user's credentials may not satisfy all claims.",
    docsPath: "/errors/presentation-rejected",
  },
  credential_expired: {
    message: "One or more credentials have expired.",
    hint: "The user needs to renew their credentials with the issuing authority.",
    docsPath: "/errors/credential-expired",
  },
  credential_revoked: {
    message: "One or more credentials have been revoked.",
    hint: "The credential was invalidated by the issuer. The user should contact their issuing authority.",
    docsPath: "/errors/credential-revoked",
  },
  // Token
  token_invalid: {
    message: "Authentication token is invalid.",
    hint: "The token may be malformed. Ensure you're using the clientToken from startVerification().",
    docsPath: "/errors/token-invalid",
  },
  token_expired: {
    message: "Authentication token has expired.",
    hint: "Tokens expire with the session. Create a new session to get a fresh token.",
    docsPath: "/errors/token-expired",
  },
  token_signature_invalid: {
    message: "Token signature verification failed.",
    hint: "The token was signed with a different key. Check your secret key configuration.",
    docsPath: "/errors/token-signature-invalid",
  },
  // Network
  network_error: {
    message: "Network error. Please check your connection.",
    hint: "Verify internet connectivity and that your firewall allows connections to api.authbound.io.",
    docsPath: "/errors/network-error",
  },
  gateway_unavailable: {
    message: "Authbound service is temporarily unavailable.",
    hint: "Check https://status.authbound.io for service status. The request can be retried.",
    docsPath: "/errors/gateway-unavailable",
  },
  rate_limited: {
    message: "Too many requests. Please wait and try again.",
    hint: "Implement exponential backoff. Check the Retry-After header for wait time.",
    docsPath: "/errors/rate-limited",
  },
  // Internal
  internal_error: {
    message: "An unexpected error occurred.",
    hint: "This is likely a bug. Please report it at https://github.com/authbound/sdk/issues.",
    docsPath: "/errors/internal-error",
  },
  unknown_error: {
    message: "An unknown error occurred.",
    hint: "Check the error details for more information. If this persists, contact support.",
    docsPath: "/errors/unknown",
  },
};

/**
 * Human-readable messages for each error code.
 * @deprecated Use ERROR_METADATA instead for hints and docs links.
 */
export const ERROR_MESSAGES: Record<AuthboundErrorCode, string> =
  Object.fromEntries(
    Object.entries(ERROR_METADATA).map(([code, meta]) => [code, meta.message])
  ) as Record<AuthboundErrorCode, string>;

// ============================================================================
// Error Class
// ============================================================================

/**
 * Authbound SDK error.
 *
 * @example
 * ```ts
 * try {
 *   await client.startVerification();
 * } catch (error) {
 *   if (error instanceof AuthboundError) {
 *     switch (error.code) {
 *       case 'session_expired':
 *         // Handle expired session
 *         break;
 *       case 'wallet_timeout':
 *         // Show timeout UI
 *         break;
 *     }
 *   }
 * }
 * ```
 */
export class AuthboundError extends Error {
  /** Stable error code for programmatic handling */
  readonly code: AuthboundErrorCode;

  /** HTTP status code if applicable */
  readonly statusCode?: number;

  /** Additional error details for debugging */
  readonly details?: Record<string, unknown>;

  /** Whether this error is retryable */
  readonly retryable: boolean;

  /** Suggested retry delay in milliseconds (if retryable) */
  readonly retryAfter?: number;

  /** Actionable hint for resolution */
  readonly hint?: string;

  /** Documentation URL for this error */
  readonly docsUrl?: string;

  constructor(
    code: AuthboundErrorCode,
    message?: string,
    options?: {
      statusCode?: number;
      details?: Record<string, unknown>;
      retryable?: boolean;
      retryAfter?: number;
      hint?: string;
      docsUrl?: string;
      cause?: Error;
    }
  ) {
    const metadata = ERROR_METADATA[code];
    super(message ?? metadata.message, { cause: options?.cause });
    this.name = "AuthboundError";
    this.code = code;
    this.statusCode = options?.statusCode;
    this.details = options?.details;
    this.retryable = options?.retryable ?? isRetryableCode(code);
    this.retryAfter = options?.retryAfter;
    this.hint = options?.hint ?? metadata.hint;
    this.docsUrl =
      options?.docsUrl ??
      (metadata.docsPath ? `${DOCS_BASE_URL}${metadata.docsPath}` : undefined);

    // Maintains proper stack trace for where error was thrown (V8 only)
    const ErrorWithCapture = Error as typeof Error & {
      captureStackTrace?: (target: object, constructor: Function) => void;
    };
    if (ErrorWithCapture.captureStackTrace) {
      ErrorWithCapture.captureStackTrace(this, AuthboundError);
    }
  }

  /**
   * Get a formatted error message with hint and docs link.
   * Useful for displaying in developer consoles.
   */
  get fullMessage(): string {
    let msg = this.message;
    if (this.hint) {
      msg += `\n\nHint: ${this.hint}`;
    }
    if (this.docsUrl) {
      msg += `\n\nDocs: ${this.docsUrl}`;
    }
    return msg;
  }

  /**
   * Create an error from a Gateway API response.
   */
  static fromResponse(
    response: Response,
    body?: {
      code?: string;
      message?: string;
      details?: Record<string, unknown>;
    }
  ): AuthboundError {
    const code = mapHttpStatusToCode(response.status, body?.code);
    const retryAfter = parseRetryAfter(response.headers.get("Retry-After"));

    return new AuthboundError(code, body?.message, {
      statusCode: response.status,
      details: body?.details,
      retryAfter,
    });
  }

  /**
   * Create an error from an unknown caught value.
   */
  static from(error: unknown): AuthboundError {
    if (error instanceof AuthboundError) {
      return error;
    }

    if (error instanceof Error) {
      // Check for network errors
      if (error.name === "TypeError" && error.message.includes("fetch")) {
        return new AuthboundError("network_error", error.message, {
          cause: error,
        });
      }

      return new AuthboundError("unknown_error", error.message, {
        cause: error,
      });
    }

    return new AuthboundError("unknown_error", String(error));
  }

  /**
   * Serialize error for logging or transmission.
   */
  toJSON(): {
    name: string;
    code: AuthboundErrorCode;
    message: string;
    statusCode?: number;
    details?: Record<string, unknown>;
    retryable: boolean;
    retryAfter?: number;
    hint?: string;
    docsUrl?: string;
  } {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      statusCode: this.statusCode,
      details: this.details,
      retryable: this.retryable,
      retryAfter: this.retryAfter,
      hint: this.hint,
      docsUrl: this.docsUrl,
    };
  }
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Check if an error code represents a retryable error.
 */
function isRetryableCode(code: AuthboundErrorCode): boolean {
  const retryableCodes: AuthboundErrorCode[] = [
    "network_error",
    "gateway_unavailable",
    "rate_limited",
    "internal_error",
    "wallet_timeout",
  ];
  return retryableCodes.includes(code);
}

/**
 * Map HTTP status code to AuthboundErrorCode.
 */
function mapHttpStatusToCode(
  status: number,
  apiCode?: string
): AuthboundErrorCode {
  // If API provided a code, try to use it
  if (apiCode && isValidErrorCode(apiCode)) {
    return apiCode as AuthboundErrorCode;
  }

  // Map by HTTP status
  switch (status) {
    case 400:
      return "config_invalid";
    case 401:
      return "token_invalid";
    case 403:
      return "token_signature_invalid";
    case 404:
      return "session_not_found";
    case 408:
      return "wallet_timeout";
    case 410:
      return "session_expired";
    case 422:
      return "policy_invalid";
    case 429:
      return "rate_limited";
    case 502:
    case 503:
    case 504:
      return "gateway_unavailable";
    default:
      return status >= 500 ? "internal_error" : "unknown_error";
  }
}

/**
 * Parse Retry-After header value.
 */
function parseRetryAfter(header: string | null): number | undefined {
  if (!header) return undefined;

  // If it's a number, it's seconds
  const seconds = Number.parseInt(header, 10);
  if (!isNaN(seconds)) {
    return seconds * 1000;
  }

  // If it's a date, calculate delay
  const date = Date.parse(header);
  if (!isNaN(date)) {
    const delay = date - Date.now();
    return delay > 0 ? delay : undefined;
  }

  return undefined;
}

/**
 * Check if a string is a valid AuthboundErrorCode.
 */
function isValidErrorCode(code: string): code is AuthboundErrorCode {
  return code in ERROR_MESSAGES;
}

/**
 * Check if an error is an AuthboundError.
 */
export function isAuthboundError(error: unknown): error is AuthboundError {
  return error instanceof AuthboundError;
}

/**
 * Assert that an error is an AuthboundError, throwing if not.
 */
export function assertAuthboundError(
  error: unknown
): asserts error is AuthboundError {
  if (!isAuthboundError(error)) {
    throw new TypeError(`Expected AuthboundError, got ${typeof error}`);
  }
}
