/**
 * Client factory for creating Authbound SDK instances.
 *
 * @example
 * ```ts
 * import { createClient } from '@authbound-sdk/core';
 *
 * const client = createClient({
 *   publishableKey: 'pk_live_...',
 *   policyId: 'age-gate-18@1.0.0',
 * });
 *
 * // Start verification
 * const { sessionId, authorizationRequestUrl, clientToken } =
 *   await client.startVerification();
 *
 * // Subscribe to status updates
 * const cleanup = client.subscribeToStatus(sessionId, clientToken, (event) => {
 *   console.log('Status:', event.status);
 * });
 * ```
 */

import { buildDeepLink, buildUniversalLink } from "../links";
import { createPollingSubscription, createStatusSubscription } from "../status";
import type { ClientToken, PolicyId, SessionId } from "../types/branded";
import { AuthboundError } from "../types/errors";
import type {
  CreateSessionResponse,
  EudiVerificationStatus,
  StatusEvent,
} from "../types/verification";
import {
  CreateSessionResponseSchema,
  StatusEventSchema,
} from "../types/verification";
import type { AuthboundClientConfig, ResolvedConfig } from "./config";
import { resolveConfig } from "./config";
import { createHttpClient, createSessionClient } from "./http";

// ============================================================================
// Client Interface
// ============================================================================

export interface AuthboundClient {
  /** Resolved configuration */
  readonly config: ResolvedConfig;

  /**
   * Start a verification session.
   *
   * Creates a session through your backend, which securely calls the Gateway
   * using your secret key. Returns session details for displaying QR code.
   */
  startVerification(options?: {
    policyId?: PolicyId;
    customerUserRef?: string;
    metadata?: Record<string, string>;
  }): Promise<CreateSessionResponse>;

  /**
   * Subscribe to session status updates via SSE.
   *
   * Uses Server-Sent Events for real-time updates with automatic
   * polling fallback if SSE fails.
   *
   * @returns Cleanup function to stop subscription
   */
  subscribeToStatus(
    sessionId: SessionId,
    clientToken: ClientToken,
    onEvent: (event: StatusEvent) => void,
    options?: {
      onError?: (error: AuthboundError) => void;
      fallbackToPolling?: boolean;
    }
  ): () => void;

  /**
   * Poll for session status (manual fallback).
   *
   * Use subscribeToStatus for real-time updates. This is exposed for
   * environments where SSE is not available.
   */
  pollStatus(
    sessionId: SessionId,
    clientToken: ClientToken
  ): Promise<{ status: EudiVerificationStatus; result?: unknown }>;

  /**
   * Generate a deep link for mobile wallet.
   */
  getDeepLink(authorizationRequestUrl: string): string;

  /**
   * Generate a universal link that works across platforms.
   */
  getUniversalLink(authorizationRequestUrl: string): string;

  /**
   * Debug logging (only if debug is enabled).
   */
  log(...args: unknown[]): void;
}

// ============================================================================
// Client Factory
// ============================================================================

/**
 * Create an Authbound client for browser use.
 *
 * @example
 * ```ts
 * const client = createClient({
 *   publishableKey: process.env.NEXT_PUBLIC_AUTHBOUND_PK,
 *   policyId: 'age-gate-18@1.0.0',
 * });
 * ```
 */
export function createClient(config: AuthboundClientConfig): AuthboundClient {
  const resolvedConfig = resolveConfig(config);
  const httpClient = createHttpClient(resolvedConfig);
  const sessionClient = createSessionClient(resolvedConfig);

  // Debug logger
  function log(...args: unknown[]): void {
    if (resolvedConfig.debug) {
      console.log("[Authbound]", ...args);
    }
  }

  return {
    config: resolvedConfig,

    async startVerification(options = {}) {
      const policyId = options.policyId ?? resolvedConfig.policyId;

      if (!policyId) {
        throw new AuthboundError(
          "config_missing",
          "Policy ID is required. Provide it in createClient() or startVerification()."
        );
      }

      log("Starting verification with policy:", policyId);

      const response = await sessionClient.createSession({
        policyId,
        customerUserRef: options.customerUserRef,
        metadata: options.metadata,
      });

      // Validate response
      const parsed = CreateSessionResponseSchema.safeParse(response);
      if (!parsed.success) {
        throw new AuthboundError("internal_error", "Invalid session response", {
          details: { issues: parsed.error.issues },
        });
      }

      log("Session created:", parsed.data.sessionId);

      return parsed.data as CreateSessionResponse;
    },

    subscribeToStatus(sessionId, clientToken, onEvent, options = {}) {
      const { onError, fallbackToPolling = true } = options;

      log("Subscribing to status for session:", sessionId);

      // Wrap event handler to validate and log
      const handleEvent = (event: StatusEvent) => {
        const parsed = StatusEventSchema.safeParse(event);
        if (!parsed.success) {
          log("Invalid status event received:", event);
          return;
        }
        log("Status event:", parsed.data.type, parsed.data.status);
        onEvent(parsed.data);
      };

      // Wrap error handler
      const handleError = (error: AuthboundError) => {
        log("Status subscription error:", error.code);
        if (onError) {
          onError(error);
        }
      };

      // Track active cleanup function to prevent resource leaks
      // when falling back from SSE to polling
      let activeCleanup: (() => void) | null = null;
      let isCleanedUp = false;

      // Unified cleanup function that cleans up whichever subscription is active
      const cleanup = () => {
        isCleanedUp = true;
        if (activeCleanup) {
          activeCleanup();
          activeCleanup = null;
        }
      };

      // Try SSE first
      try {
        activeCleanup = createStatusSubscription(
          resolvedConfig,
          sessionId,
          clientToken,
          handleEvent,
          {
            onError: (error) => {
              // Don't start polling if already cleaned up
              if (isCleanedUp) return;

              if (fallbackToPolling) {
                log("SSE failed, falling back to polling");

                // Clean up old SSE subscription before creating polling
                // This prevents race condition if cleanup() is called while
                // createPollingSubscription is executing
                if (activeCleanup) {
                  activeCleanup();
                  activeCleanup = null;
                }

                // Check again after cleanup in case cleanup() was called
                if (isCleanedUp) return;

                // Start polling instead and track the new cleanup
                activeCleanup = createPollingSubscription(
                  resolvedConfig,
                  sessionId,
                  clientToken,
                  handleEvent,
                  { onError: handleError }
                );
              } else {
                handleError(error);
              }
            },
          }
        );

        return cleanup;
      } catch (error) {
        // If SSE setup fails immediately, fall back to polling
        if (fallbackToPolling) {
          log("SSE setup failed, using polling");
          activeCleanup = createPollingSubscription(
            resolvedConfig,
            sessionId,
            clientToken,
            handleEvent,
            { onError: handleError }
          );
          return cleanup;
        }
        throw AuthboundError.from(error);
      }
    },

    async pollStatus(sessionId, clientToken) {
      const response = await httpClient.get<{
        status: EudiVerificationStatus;
        result?: unknown;
      }>(`/v1/verifications/${sessionId}/status`, {
        token: clientToken,
      });

      return response.data;
    },

    getDeepLink(authorizationRequestUrl) {
      return buildDeepLink(authorizationRequestUrl);
    },

    getUniversalLink(authorizationRequestUrl) {
      return buildUniversalLink(authorizationRequestUrl);
    },

    log,
  };
}

// ============================================================================
// Singleton Pattern (Optional)
// ============================================================================

let defaultClient: AuthboundClient | null = null;

/**
 * Configure the default client instance.
 *
 * Use this for simpler integration where you don't need multiple clients.
 *
 * @example
 * ```ts
 * // In app initialization
 * configure({
 *   publishableKey: process.env.NEXT_PUBLIC_AUTHBOUND_PK,
 *   policyId: 'age-gate-18@1.0.0',
 * });
 *
 * // Later in code
 * const client = getClient();
 * ```
 */
export function configure(config: AuthboundClientConfig): void {
  defaultClient = createClient(config);
}

/**
 * Get the default client instance.
 *
 * @throws {AuthboundError} If configure() hasn't been called
 */
export function getClient(): AuthboundClient {
  if (!defaultClient) {
    throw new AuthboundError(
      "config_missing",
      "Authbound client not configured. Call configure() first."
    );
  }
  return defaultClient;
}

/**
 * Check if a default client is configured.
 */
export function isConfigured(): boolean {
  return defaultClient !== null;
}
