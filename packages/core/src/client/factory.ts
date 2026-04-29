/**
 * Client factory for creating Authbound SDK instances.
 *
 * @example
 * ```ts
 * import { asPolicyId, createClient } from '@authbound/core';
 *
 * const client = createClient({
 *   publishableKey: 'pk_live_...',
 *   policyId: asPolicyId(process.env.NEXT_PUBLIC_AUTHBOUND_POLICY_ID!),
 * });
 *
 * // Start verification
 * const { verificationId, authorizationRequestUrl, clientToken } =
 *   await client.startVerification();
 *
 * // Subscribe to status updates
 * const cleanup = client.subscribeToStatus(verificationId, clientToken, (event) => {
 *   console.log('Status:', event.status);
 * });
 * ```
 */

import { buildDeepLink, buildUniversalLink } from "../links";
import { createPollingSubscription, createStatusSubscription } from "../status";
import type { ClientToken, PolicyId, VerificationId } from "../types/branded";
import { AuthboundError } from "../types/errors";
import type {
  CreateVerificationResponse,
  EudiVerificationStatus,
  StatusEvent,
} from "../types/verification";
import {
  CreateVerificationResponseSchema,
  StatusEventSchema,
} from "../types/verification";
import type { AuthboundClientConfig, ResolvedConfig } from "./config";
import { resolveConfig } from "./config";
import { createHttpClient, createVerificationClient } from "./http";

// ============================================================================
// Client Interface
// ============================================================================

export interface AuthboundClient {
  /** Resolved configuration */
  readonly config: ResolvedConfig;

  /**
   * Start a verification.
   *
   * Creates a verification through your backend, which securely calls the
   * Gateway using your secret key. Returns details for displaying QR code.
   */
  startVerification(options?: {
    policyId?: PolicyId;
    customerUserRef?: string;
    metadata?: Record<string, string>;
    provider?: "auto" | "vcs" | "eudi";
  }): Promise<CreateVerificationResponse>;

  /**
   * Subscribe to verification status updates via SSE.
   *
   * Uses Server-Sent Events for real-time updates with automatic
   * polling fallback if SSE fails.
   *
   * @returns Cleanup function to stop subscription
   */
  subscribeToStatus(
    verificationId: VerificationId,
    clientToken: ClientToken,
    onEvent: (event: StatusEvent) => void,
    options?: {
      onError?: (error: AuthboundError) => void;
      fallbackToPolling?: boolean;
    }
  ): () => void;

  /**
   * Poll for verification status (manual fallback).
   *
   * Use subscribeToStatus for real-time updates. This is exposed for
   * environments where SSE is not available.
   */
  pollStatus(
    verificationId: VerificationId,
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
 *   policyId: asPolicyId(process.env.NEXT_PUBLIC_AUTHBOUND_POLICY_ID!),
 * });
 * ```
 */
export function createClient(config: AuthboundClientConfig): AuthboundClient {
  const resolvedConfig = resolveConfig(config);
  const httpClient = createHttpClient(resolvedConfig);
  const verificationClient = createVerificationClient(resolvedConfig);

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

      const response = await verificationClient.createVerification({
        policyId,
        customerUserRef: options.customerUserRef,
        metadata: options.metadata,
        provider: options.provider,
      });

      // Validate response
      const parsed = CreateVerificationResponseSchema.safeParse(response);
      if (!parsed.success) {
        throw new AuthboundError(
          "internal_error",
          "Invalid verification response",
          {
            details: { issues: parsed.error.issues },
          }
        );
      }

      log("Verification created:", parsed.data.verificationId);

      return parsed.data as CreateVerificationResponse;
    },

    subscribeToStatus(verificationId, clientToken, onEvent, options = {}) {
      const { onError, fallbackToPolling = true } = options;

      log("Subscribing to status for verification:", verificationId);

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
          verificationId,
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
                  verificationId,
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
            verificationId,
            clientToken,
            handleEvent,
            { onError: handleError }
          );
          return cleanup;
        }
        throw AuthboundError.from(error);
      }
    },

    async pollStatus(verificationId, clientToken) {
      const response = await httpClient.get<{
        status: EudiVerificationStatus;
        result?: unknown;
      }>(`/v1/verifications/${verificationId}/status`, {
        token: clientToken,
        headers: {
          "x-authbound-publishable-key": resolvedConfig.publishableKey,
        },
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
 *   policyId: asPolicyId(process.env.NEXT_PUBLIC_AUTHBOUND_POLICY_ID!),
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
