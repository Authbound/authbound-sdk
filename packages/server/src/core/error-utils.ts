/**
 * Error sanitization utilities for production safety.
 * Prevents leaking sensitive information in error messages.
 */

export interface SanitizedError {
  message: string;
  code: string;
  details?: unknown;
}

const TOKEN_FIELD_PATTERN =
  "(?:client[_-]?token|clientToken|result[_-]?token|resultToken)";
const SENSITIVE_IDENTIFIER_PATTERN =
  "(?:client[_-]?token|clientToken|result[_-]?token|resultToken|credential[_-]?offer(?:[_-]?uri)?|pre[_-]?authorized[_-]?code|tx[_-]?code)";
const SENSITIVE_ASSIGNMENT_VALUE_PATTERN = String.raw`(?:\\?["'][^"'\\]*(?:\\.[^"'\\]*)*\\?["']|[^\s,}&]+)`;

function sensitiveAssignmentPattern(fieldPattern: string): RegExp {
  return new RegExp(
    String.raw`(?:\\?["'])?\b${fieldPattern}(?:\\?["'])?\s*[:=]\s*${SENSITIVE_ASSIGNMENT_VALUE_PATTERN}`,
    "gi"
  );
}

const SENSITIVE_TEXT_PATTERNS = [
  sensitiveAssignmentPattern(TOKEN_FIELD_PATTERN),
  sensitiveAssignmentPattern("credential[_-]?offer(?:[_-]?uri)?"),
  sensitiveAssignmentPattern("pre[_-]?authorized[_-]?code"),
  sensitiveAssignmentPattern("tx[_-]?code"),
  new RegExp(
    `\\b[A-Za-z0-9._~-]*${SENSITIVE_IDENTIFIER_PATTERN}[A-Za-z0-9._~-]*\\b`,
    "gi"
  ),
  new RegExp(`\\b${TOKEN_FIELD_PATTERN}[A-Za-z0-9._~+/=-]*`, "gi"),
  /\bsk_(?:test|live)_[A-Za-z0-9._~-]+/gi,
  /\bwhsec_[A-Za-z0-9._~-]+/gi,
  /\bBearer\s+[A-Za-z0-9._~+/=-]+/gi,
  /\b(?:openid4vp|openid-credential-offer|haip):\/\/\S+/gi,
] as const;

export function redactSensitiveText(value: string): string {
  return SENSITIVE_TEXT_PATTERNS.reduce(
    (redacted, pattern) => redacted.replace(pattern, "[redacted]"),
    value
  );
}

function sanitizeDebugValue(
  value: unknown,
  seen = new WeakSet<object>(),
  depth = 0
): unknown {
  if (typeof value === "string") {
    return redactSensitiveText(value);
  }

  if (typeof value !== "object" || value === null) {
    return value;
  }

  if (seen.has(value)) {
    return "[circular]";
  }
  if (depth >= 4) {
    return "[truncated]";
  }

  seen.add(value);

  if (value instanceof Error) {
    return {
      name: redactSensitiveText(value.name),
      message: redactSensitiveText(value.message),
      ...(value.stack
        ? { stack: redactSensitiveText(value.stack) }
        : undefined),
      ...(value.cause
        ? { cause: sanitizeDebugValue(value.cause, seen, depth + 1) }
        : undefined),
    };
  }

  if (Array.isArray(value)) {
    return value.map((item) => sanitizeDebugValue(item, seen, depth + 1));
  }

  const sanitized: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    sanitized[key] = sanitizeDebugValue(item, seen, depth + 1);
  }
  return sanitized;
}

/**
 * Sanitize an error for client-facing responses.
 * In production, only returns safe error messages.
 * In debug mode, includes more details.
 */
export function sanitizeError(error: unknown, debug = false): SanitizedError {
  // Default error
  const defaultError: SanitizedError = {
    message: "An error occurred",
    code: "INTERNAL_ERROR",
  };

  if (!(error instanceof Error)) {
    return defaultError;
  }

  const errorMessage = error.message;
  const errorName = error.name;

  // In debug mode, include more details
  if (debug) {
    return {
      message: redactSensitiveText(errorMessage),
      code: redactSensitiveText(errorName || "ERROR"),
      details: {
        stack:
          typeof error.stack === "string"
            ? redactSensitiveText(error.stack)
            : undefined,
        cause: sanitizeDebugValue(error.cause),
      },
    };
  }

  // In production, sanitize error messages
  // Check for common error patterns that might leak sensitive info
  const sensitivePatterns = [
    /secret/i,
    /key/i,
    /password/i,
    /token/i,
    /api[_-]?key/i,
    /auth/i,
    /credential/i,
  ];

  const hasSensitiveInfo = sensitivePatterns.some((pattern) =>
    pattern.test(errorMessage)
  );

  if (hasSensitiveInfo) {
    // Don't expose error messages that might contain sensitive info
    return defaultError;
  }

  // For known error types, return safe messages
  if (errorName === "TypeError" || errorName === "ReferenceError") {
    return {
      message: "Invalid request",
      code: "INVALID_REQUEST",
    };
  }

  if (errorName === "SyntaxError") {
    return {
      message: "Invalid request format",
      code: "INVALID_FORMAT",
    };
  }

  // For network/upstream errors, return generic message
  if (
    errorMessage.includes("fetch") ||
    errorMessage.includes("network") ||
    errorMessage.includes("ECONNREFUSED") ||
    errorMessage.includes("ETIMEDOUT")
  ) {
    return {
      message: "Service temporarily unavailable",
      code: "SERVICE_UNAVAILABLE",
    };
  }

  // For validation errors, return safe message
  if (errorMessage.includes("validation") || errorMessage.includes("parse")) {
    return {
      message: "Invalid request data",
      code: "VALIDATION_ERROR",
    };
  }

  // For other errors, return generic message
  return defaultError;
}

/**
 * Log error with appropriate detail level.
 * In production, logs minimal info. In debug mode, logs full details.
 */
export function logError(error: unknown, context: string, debug = false): void {
  if (debug) {
    const sanitized = sanitizeError(error, true);
    console.error(`[Authbound] ${context}:`, sanitized);
    const stack =
      sanitized.details &&
      typeof sanitized.details === "object" &&
      "stack" in sanitized.details &&
      typeof sanitized.details.stack === "string"
        ? sanitized.details.stack
        : undefined;
    if (stack) {
      console.error(`[Authbound] ${context} stack:`, stack);
    }
  } else {
    // In production, log minimal info
    const sanitized = sanitizeError(error, false);
    console.error(`[Authbound] ${context}:`, {
      message: sanitized.message,
      code: sanitized.code,
    });
  }
}

/**
 * Create a safe error response for clients.
 * Never exposes sensitive information.
 */
export function createSafeErrorResponse(
  error: unknown,
  _status = 500,
  debug = false
): { message: string; code: string } {
  const sanitized = sanitizeError(error, debug);
  return {
    message: sanitized.message,
    code: sanitized.code,
  };
}
