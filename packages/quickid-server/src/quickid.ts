/**
 * QuickIDServer - Main SDK class for server-side QuickID integration
 *
 * @example
 * ```typescript
 * import { QuickIDServer } from "@authbound/quickid-server";
 *
 * const quickid = new QuickIDServer({
 *   apiKey: process.env.QUICKID_SECRET_KEY!,
 * });
 *
 * // Create a verification session
 * const session = await quickid.sessions.create({
 *   customer_user_ref: "user_123",
 *   callback_url: "https://myapp.com/verify/callback",
 * });
 *
 * // Poll for results
 * const result = await quickid.sessions.poll(session.session_id);
 * ```
 */

import {
	type CreateSessionParams,
	CreateSessionParamsSchema,
	type SessionCreated,
	SessionCreatedSchema,
	type SessionResult,
	SessionResultSchema,
	isTerminalStatus,
	type WebhookEvent,
	WebhookEventSchema,
	type WebhookVerifyOptions,
} from "@authbound/quickid-core";

import { QuickIDTimeoutError, QuickIDValidationError } from "./errors";
import { HttpClient } from "./http/client";
import {
	constructEvent,
	generateSignatureHeader,
	verifySignature,
} from "./webhooks/signature";

// ============================================================================
// Configuration
// ============================================================================

/**
 * Configuration for QuickIDServer
 */
export interface QuickIDServerConfig {
	/** API key (starts with "sk_live_" or "sk_test_") */
	apiKey: string;
	/** Base URL of QuickID API. Defaults to production API */
	apiBaseUrl?: string;
	/** Request timeout in milliseconds. Default: 30000 */
	timeout?: number;
	/** Custom fetch implementation (for testing) */
	fetch?: typeof fetch;
}

/**
 * Options for polling session results
 */
export interface PollOptions {
	/** Polling interval in milliseconds. Default: 2000 */
	intervalMs?: number;
	/** Maximum polling duration in milliseconds. Default: 300000 (5 minutes) */
	maxDurationMs?: number;
	/** Callback called on each poll with current result */
	onPoll?: (result: SessionResult) => void;
}

// ============================================================================
// Default configuration
// ============================================================================

const DEFAULT_API_BASE_URL = "https://api.quickid.authbound.com";
const DEFAULT_TIMEOUT_MS = 30000;
const DEFAULT_POLL_INTERVAL_MS = 2000;
const DEFAULT_POLL_MAX_DURATION_MS = 300000; // 5 minutes

// ============================================================================
// Sessions Namespace
// ============================================================================

/**
 * Sessions API namespace
 */
class SessionsNamespace {
	constructor(private readonly client: HttpClient) {}

	/**
	 * Create a new verification session
	 *
	 * @param params - Session creation parameters
	 * @returns Created session with client token
	 *
	 * @example
	 * ```typescript
	 * const session = await quickid.sessions.create({
	 *   customer_user_ref: "user_123",
	 *   callback_url: "https://myapp.com/verify/callback",
	 *   customer_name: "John Doe", // optional
	 *   reason: "Account verification", // optional
	 * });
	 *
	 * console.log(session.session_id); // UUID
	 * console.log(session.client_token); // JWT for client SDK
	 * ```
	 */
	async create(params: CreateSessionParams): Promise<SessionCreated> {
		// Validate params
		const validation = CreateSessionParamsSchema.safeParse(params);
		if (!validation.success) {
			const issue = validation.error.issues[0];
			throw new QuickIDValidationError(
				`Invalid parameter: ${issue?.path.join(".")} - ${issue?.message}`,
				issue?.path.join("."),
			);
		}

		const response = await this.client.post<unknown>(
			"/api/v1/sessions",
			validation.data,
		);

		// Validate response
		const result = SessionCreatedSchema.safeParse(response);
		if (!result.success) {
			throw new QuickIDValidationError(
				"Invalid response from API: failed to parse session creation response",
			);
		}

		return result.data;
	}

	/**
	 * Retrieve a verification session by ID
	 *
	 * @param sessionId - Session ID (UUID)
	 * @returns Session result with current status
	 *
	 * @example
	 * ```typescript
	 * const result = await quickid.sessions.retrieve("vs_abc123...");
	 *
	 * if (result.status === "verified") {
	 *   console.log(result.verified_outputs?.first_name);
	 * }
	 * ```
	 */
	async retrieve(sessionId: string): Promise<SessionResult> {
		const response = await this.client.get<unknown>(
			`/api/v1/sessions/${sessionId}`,
		);

		// Validate response
		const result = SessionResultSchema.safeParse(response);
		if (!result.success) {
			throw new QuickIDValidationError(
				"Invalid response from API: failed to parse session result",
			);
		}

		return result.data;
	}

	/**
	 * Poll for session completion
	 *
	 * Continuously polls until the session reaches a terminal status
	 * (verified, failed, or canceled).
	 *
	 * @param sessionId - Session ID (UUID)
	 * @param options - Polling options
	 * @returns Final session result
	 * @throws QuickIDTimeoutError if polling times out
	 *
	 * @example
	 * ```typescript
	 * const result = await quickid.sessions.poll(sessionId, {
	 *   intervalMs: 2000,
	 *   maxDurationMs: 60000, // 1 minute
	 *   onPoll: (r) => console.log(`Status: ${r.status}`),
	 * });
	 * ```
	 */
	async poll(
		sessionId: string,
		options?: PollOptions,
	): Promise<SessionResult> {
		const intervalMs = options?.intervalMs ?? DEFAULT_POLL_INTERVAL_MS;
		const maxDurationMs = options?.maxDurationMs ?? DEFAULT_POLL_MAX_DURATION_MS;
		const onPoll = options?.onPoll;

		const startTime = Date.now();
		let lastResult: SessionResult | null = null;

		while (Date.now() - startTime < maxDurationMs) {
			const result = await this.retrieve(sessionId);
			lastResult = result;

			// Notify callback
			if (onPoll) {
				onPoll(result);
			}

			// Check if terminal
			if (isTerminalStatus(result.status)) {
				return result;
			}

			// Wait before next poll
			await sleep(intervalMs);
		}

		// Timeout
		throw new QuickIDTimeoutError(
			sessionId,
			lastResult?.status ?? "unknown",
			Date.now() - startTime,
		);
	}
}

// ============================================================================
// Webhooks Namespace
// ============================================================================

/**
 * Webhook utilities namespace
 */
class WebhooksNamespace {
	/**
	 * Construct and verify a webhook event from raw request data
	 *
	 * @param rawBody - Raw request body (string or Buffer)
	 * @param signatureHeader - Value of Authbound-Signature header
	 * @param secret - Webhook secret
	 * @param options - Verification options
	 * @returns Verified webhook event
	 * @throws QuickIDSignatureVerificationError if signature is invalid
	 *
	 * @example
	 * ```typescript
	 * const event = quickid.webhookEvents.construct(
	 *   rawBody,
	 *   request.headers.get("Authbound-Signature")!,
	 *   process.env.WEBHOOK_SECRET!
	 * );
	 *
	 * switch (event.type) {
	 *   case "identity.verification_session.verified":
	 *     // Handle verified session
	 *     break;
	 * }
	 * ```
	 */
	construct(
		rawBody: string | Buffer,
		signatureHeader: string,
		secret: string,
		options?: WebhookVerifyOptions,
	): WebhookEvent {
		return constructEvent(
			rawBody,
			signatureHeader,
			secret,
			(body) => {
				const parsed = JSON.parse(body);
				const result = WebhookEventSchema.safeParse(parsed);
				if (!result.success) {
					throw new QuickIDValidationError(
						"Invalid webhook payload: failed to parse event",
					);
				}
				return result.data;
			},
			options?.tolerance,
		);
	}

	/**
	 * Verify webhook signature without parsing the body
	 *
	 * Useful when you want to verify first and parse later,
	 * or when using a custom event type.
	 *
	 * @param rawBody - Raw request body (string or Buffer)
	 * @param signatureHeader - Value of Authbound-Signature header
	 * @param secret - Webhook secret
	 * @param options - Verification options
	 * @returns true if signature is valid
	 *
	 * @example
	 * ```typescript
	 * const isValid = quickid.webhookEvents.verifySignature(
	 *   rawBody,
	 *   signatureHeader,
	 *   secret
	 * );
	 *
	 * if (!isValid) {
	 *   return new Response("Invalid signature", { status: 401 });
	 * }
	 * ```
	 */
	verifySignature(
		rawBody: string | Buffer,
		signatureHeader: string,
		secret: string,
		options?: WebhookVerifyOptions,
	): boolean {
		return verifySignature(
			secret,
			rawBody,
			signatureHeader,
			options?.tolerance,
		);
	}

	/**
	 * Generate a test signature for webhook testing
	 *
	 * @param rawBody - Raw JSON body string
	 * @param secret - Webhook secret
	 * @param timestamp - Optional Unix timestamp (defaults to current time)
	 * @returns Complete signature header value
	 *
	 * @example
	 * ```typescript
	 * const signature = quickid.webhookEvents.generateTestSignature(
	 *   JSON.stringify(testEvent),
	 *   "whsec_test_secret"
	 * );
	 *
	 * // Use in tests
	 * const response = await fetch("/api/webhooks", {
	 *   method: "POST",
	 *   headers: { "Authbound-Signature": signature },
	 *   body: JSON.stringify(testEvent),
	 * });
	 * ```
	 */
	generateTestSignature(
		rawBody: string,
		secret: string,
		timestamp?: number,
	): string {
		return generateSignatureHeader(secret, rawBody, timestamp);
	}
}

// ============================================================================
// Main Class
// ============================================================================

/**
 * QuickIDServer SDK client
 *
 * Main entry point for server-side QuickID integration.
 * Provides session management, polling, and webhook verification.
 */
export class QuickIDServer {
	private readonly httpClient: HttpClient;
	private readonly _sessions: SessionsNamespace;
	private readonly _webhookEvents: WebhooksNamespace;

	/**
	 * Create a new QuickIDServer instance
	 *
	 * @param config - SDK configuration
	 *
	 * @example
	 * ```typescript
	 * const quickid = new QuickIDServer({
	 *   apiKey: process.env.QUICKID_SECRET_KEY!,
	 * });
	 * ```
	 */
	constructor(config: QuickIDServerConfig) {
		// Validate API key
		if (!config.apiKey) {
			throw new QuickIDValidationError(
				"apiKey is required",
				"apiKey",
			);
		}

		this.httpClient = new HttpClient({
			apiKey: config.apiKey,
			baseUrl: config.apiBaseUrl ?? DEFAULT_API_BASE_URL,
			timeout: config.timeout ?? DEFAULT_TIMEOUT_MS,
			fetch: config.fetch ?? globalThis.fetch,
		});

		this._sessions = new SessionsNamespace(this.httpClient);
		this._webhookEvents = new WebhooksNamespace();
	}

	/**
	 * Sessions API
	 *
	 * Create, retrieve, and poll verification sessions.
	 */
	get sessions(): SessionsNamespace {
		return this._sessions;
	}

	/**
	 * Webhook utilities
	 *
	 * Verify webhook signatures and construct events.
	 */
	get webhookEvents(): WebhooksNamespace {
		return this._webhookEvents;
	}
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Sleep helper for polling
 */
function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}
