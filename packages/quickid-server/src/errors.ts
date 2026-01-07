/**
 * QuickID Server SDK Error Classes
 *
 * Error hierarchy:
 * - QuickIDServerError (base)
 *   - QuickIDAPIError (4xx/5xx responses)
 *   - QuickIDAuthenticationError (invalid API key)
 *   - QuickIDSignatureVerificationError (webhook signature)
 *   - QuickIDConnectionError (network issues)
 *   - QuickIDTimeoutError (polling timeout)
 *   - QuickIDValidationError (invalid parameters)
 */

/**
 * Base error class for all QuickID Server SDK errors
 */
export class QuickIDServerError extends Error {
	/** Error type for discrimination */
	readonly type: string;
	/** Machine-readable error code */
	readonly code: string;
	/** HTTP status code if applicable */
	readonly statusCode?: number;
	/** Request ID for debugging (from API responses) */
	readonly requestId?: string;

	constructor(
		type: string,
		message: string,
		options?: {
			code?: string;
			statusCode?: number;
			requestId?: string;
			cause?: unknown;
		},
	) {
		super(message);
		this.name = "QuickIDServerError";
		this.type = type;
		this.code = options?.code ?? type;
		this.statusCode = options?.statusCode;
		this.requestId = options?.requestId;

		// Maintain proper stack trace in V8 environments
		if (Error.captureStackTrace) {
			Error.captureStackTrace(this, this.constructor);
		}

		// Set cause if provided (ES2022 error cause)
		if (options?.cause !== undefined) {
			this.cause = options.cause;
		}
	}

	/**
	 * Convert error to JSON-serializable object
	 */
	toJSON(): Record<string, unknown> {
		return {
			name: this.name,
			type: this.type,
			code: this.code,
			message: this.message,
			statusCode: this.statusCode,
			requestId: this.requestId,
		};
	}
}

/**
 * API request error (4xx/5xx responses from QuickID API)
 */
export class QuickIDAPIError extends QuickIDServerError {
	/** Raw response body if available */
	readonly rawBody?: string;

	constructor(
		message: string,
		statusCode: number,
		options?: {
			code?: string;
			requestId?: string;
			rawBody?: string;
		},
	) {
		super("api_error", message, {
			code: options?.code ?? "api_error",
			statusCode,
			requestId: options?.requestId,
		});
		this.name = "QuickIDAPIError";
		this.rawBody = options?.rawBody;
	}

	/**
	 * Create from fetch Response
	 */
	static async fromResponse(
		response: Response,
		requestId?: string,
	): Promise<QuickIDAPIError> {
		let rawBody: string | undefined;
		let errorMessage = `API request failed with status ${response.status}`;
		let errorCode = "api_error";

		try {
			rawBody = await response.text();
			const json = JSON.parse(rawBody);
			if (json.error?.message) {
				errorMessage = json.error.message;
			}
			if (json.error?.code) {
				errorCode = json.error.code;
			}
		} catch {
			// Use default message if parsing fails
		}

		return new QuickIDAPIError(errorMessage, response.status, {
			code: errorCode,
			requestId: requestId ?? response.headers.get("x-request-id") ?? undefined,
			rawBody,
		});
	}
}

/**
 * Authentication error (invalid or missing API key)
 */
export class QuickIDAuthenticationError extends QuickIDServerError {
	constructor(message = "Invalid API key provided") {
		super("authentication_error", message, {
			code: "invalid_api_key",
			statusCode: 401,
		});
		this.name = "QuickIDAuthenticationError";
	}
}

/**
 * Webhook signature verification error
 */
export class QuickIDSignatureVerificationError extends QuickIDServerError {
	constructor(message = "Webhook signature verification failed") {
		super("signature_verification_error", message, {
			code: "invalid_signature",
		});
		this.name = "QuickIDSignatureVerificationError";
	}
}

/**
 * Connection/network error
 */
export class QuickIDConnectionError extends QuickIDServerError {
	constructor(message: string, cause?: unknown) {
		super("connection_error", message, {
			code: "connection_error",
			cause,
		});
		this.name = "QuickIDConnectionError";
	}
}

/**
 * Polling timeout error
 */
export class QuickIDTimeoutError extends QuickIDServerError {
	/** Session ID that timed out */
	readonly sessionId: string;
	/** Last known status before timeout */
	readonly lastStatus: string;
	/** Duration in milliseconds before timeout */
	readonly durationMs: number;

	constructor(sessionId: string, lastStatus: string, durationMs: number) {
		super(
			"timeout_error",
			`Polling timed out after ${durationMs}ms. Session ${sessionId} last status: ${lastStatus}`,
			{ code: "polling_timeout" },
		);
		this.name = "QuickIDTimeoutError";
		this.sessionId = sessionId;
		this.lastStatus = lastStatus;
		this.durationMs = durationMs;
	}
}

/**
 * Validation error (invalid parameters)
 */
export class QuickIDValidationError extends QuickIDServerError {
	/** Field that failed validation */
	readonly field?: string;

	constructor(message: string, field?: string) {
		super("validation_error", message, {
			code: "invalid_parameters",
			statusCode: 400,
		});
		this.name = "QuickIDValidationError";
		this.field = field;
	}
}

/**
 * Type guard to check if an error is a QuickID SDK error
 */
export function isQuickIDError(error: unknown): error is QuickIDServerError {
	return error instanceof QuickIDServerError;
}

/**
 * Type guard to check if an error is an API error
 */
export function isQuickIDAPIError(error: unknown): error is QuickIDAPIError {
	return error instanceof QuickIDAPIError;
}

/**
 * Type guard to check if an error is an authentication error
 */
export function isQuickIDAuthError(
	error: unknown,
): error is QuickIDAuthenticationError {
	return error instanceof QuickIDAuthenticationError;
}

/**
 * Type guard to check if an error is a signature verification error
 */
export function isQuickIDSignatureError(
	error: unknown,
): error is QuickIDSignatureVerificationError {
	return error instanceof QuickIDSignatureVerificationError;
}
