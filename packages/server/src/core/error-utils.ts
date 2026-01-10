/**
 * Error sanitization utilities for production safety.
 * Prevents leaking sensitive information in error messages.
 */

export interface SanitizedError {
  message: string;
  code: string;
  details?: unknown;
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
      message: errorMessage,
      code: errorName || "ERROR",
      details: {
        stack: error.stack,
        cause: error.cause,
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
    console.error(`[Authbound] ${context}:`, error);
    if (error instanceof Error && error.stack) {
      console.error(`[Authbound] ${context} stack:`, error.stack);
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
  status = 500,
  debug = false
): { message: string; code: string } {
  const sanitized = sanitizeError(error, debug);
  return {
    message: sanitized.message,
    code: sanitized.code,
  };
}
