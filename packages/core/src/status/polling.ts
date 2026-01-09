/**
 * Polling-based status updates as SSE fallback.
 *
 * Uses exponential backoff: 1s, 2s, 4s, 8s, 16s, max 30s
 */

import type { SessionId, ClientToken } from "../types/branded";
import type { EudiVerificationStatus, StatusEvent } from "../types/verification";
import { isTerminalStatus } from "../types/verification";
import { AuthboundError } from "../types/errors";
import type { ResolvedConfig } from "../client/config";

// ============================================================================
// Polling Configuration
// ============================================================================

/**
 * Polling interval configuration.
 */
export interface PollingConfig {
  /** Initial polling interval in ms (default: 1000) */
  initialInterval: number;
  /** Maximum polling interval in ms (default: 30000) */
  maxInterval: number;
  /** Backoff multiplier (default: 2) */
  backoffMultiplier: number;
  /** Maximum total duration in ms (default: 300000 = 5 minutes) */
  maxDuration: number;
}

export const DEFAULT_POLLING_CONFIG: PollingConfig = {
  initialInterval: 1000,
  maxInterval: 30000,
  backoffMultiplier: 2,
  maxDuration: 5 * 60 * 1000, // 5 minutes
};

// ============================================================================
// Polling Subscription
// ============================================================================

export interface PollingSubscriptionOptions {
  /** Called when an error occurs */
  onError?: (error: AuthboundError) => void;
  /** Custom polling configuration */
  pollingConfig?: Partial<PollingConfig>;
}

/**
 * Create a polling subscription for session status updates.
 *
 * Uses exponential backoff to reduce server load while maintaining responsiveness.
 *
 * @returns Cleanup function to stop polling
 */
export function createPollingSubscription(
  config: ResolvedConfig,
  sessionId: SessionId,
  clientToken: ClientToken,
  onEvent: (event: StatusEvent) => void,
  options: PollingSubscriptionOptions = {}
): () => void {
  const { onError } = options;
  const pollingConfig = {
    ...DEFAULT_POLLING_CONFIG,
    ...options.pollingConfig,
  };

  let isCleanedUp = false;
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  let currentInterval = pollingConfig.initialInterval;
  let lastStatus: EudiVerificationStatus = "idle";
  const startTime = Date.now();

  const url = new URL(
    `/v1/sessions/${sessionId}/status`,
    config.gatewayUrl
  );

  async function poll(): Promise<void> {
    if (isCleanedUp) return;

    // Calculate remaining time
    const elapsed = Date.now() - startTime;
    const remainingTime = pollingConfig.maxDuration - elapsed;

    // Check if we've exceeded max duration
    if (remainingTime <= 0) {
      const timeoutEvent: StatusEvent = {
        type: "timeout",
        status: "timeout",
        timestamp: new Date().toISOString(),
      };
      onEvent(timeoutEvent);
      cleanup();
      return;
    }

    // Use AbortController to enforce timeout on the network request itself
    // This prevents slow requests from exceeding max duration
    const abortController = new AbortController();
    const requestTimeoutId = setTimeout(
      () => abortController.abort(),
      Math.min(remainingTime, 30000) // Cap individual request at 30s
    );

    try {
      const response = await fetch(url.toString(), {
        headers: {
          Authorization: `Bearer ${clientToken}`,
          Accept: "application/json",
        },
        signal: abortController.signal,
      });

      clearTimeout(requestTimeoutId);

      if (!response.ok) {
        throw AuthboundError.fromResponse(response);
      }

      const data = await response.json() as {
        status: EudiVerificationStatus;
        result?: unknown;
        error?: { code: string; message: string };
        timeRemaining?: number;
      };

      // Create event based on response
      const event: StatusEvent = {
        type: data.result ? "result" : data.error ? "error" : "status",
        status: data.status,
        result: data.result as StatusEvent["result"],
        error: data.error,
        timestamp: new Date().toISOString(),
      };

      // Emit event if status changed or if it's a terminal state
      if (data.status !== lastStatus || isTerminalStatus(data.status)) {
        lastStatus = data.status;
        onEvent(event);
      }

      // Stop polling if terminal state
      if (isTerminalStatus(data.status)) {
        cleanup();
        return;
      }

      // Schedule next poll with backoff
      scheduleNextPoll();
    } catch (error) {
      clearTimeout(requestTimeoutId);

      if (isCleanedUp) return;

      // Handle AbortError from our timeout as a timeout event
      if (error instanceof Error && error.name === "AbortError") {
        const timeoutEvent: StatusEvent = {
          type: "timeout",
          status: "timeout",
          timestamp: new Date().toISOString(),
        };
        onEvent(timeoutEvent);
        cleanup();
        return;
      }

      const authboundError = AuthboundError.from(error);

      if (config.debug) {
        console.error("[Authbound] Polling error:", authboundError.message);
      }

      // For retryable errors, continue polling
      if (authboundError.retryable) {
        scheduleNextPoll();
        return;
      }

      // For non-retryable errors, notify and stop
      if (onError) {
        onError(authboundError);
      }

      const errorEvent: StatusEvent = {
        type: "error",
        status: "error",
        error: {
          code: authboundError.code,
          message: authboundError.message,
        },
        timestamp: new Date().toISOString(),
      };
      onEvent(errorEvent);
      cleanup();
    }
  }

  function scheduleNextPoll(): void {
    if (isCleanedUp) return;

    if (config.debug) {
      console.log(`[Authbound] Next poll in ${currentInterval}ms`);
    }

    timeoutId = setTimeout(() => {
      poll();
      // Increase interval with backoff
      currentInterval = Math.min(
        currentInterval * pollingConfig.backoffMultiplier,
        pollingConfig.maxInterval
      );
    }, currentInterval);
  }

  function cleanup(): void {
    isCleanedUp = true;
    if (timeoutId) {
      clearTimeout(timeoutId);
      timeoutId = null;
    }
    if (config.debug) {
      console.log("[Authbound] Polling subscription cleaned up");
    }
  }

  // Start polling immediately
  poll();

  // Return cleanup function
  return cleanup;
}

// ============================================================================
// Manual Poll Function
// ============================================================================

/**
 * Perform a single poll request.
 *
 * Use this for manual polling when automatic subscription isn't needed.
 */
export async function pollOnce(
  config: ResolvedConfig,
  sessionId: SessionId,
  clientToken: ClientToken
): Promise<{
  status: EudiVerificationStatus;
  result?: unknown;
  error?: { code: string; message: string };
  timeRemaining?: number;
}> {
  const url = new URL(
    `/v1/sessions/${sessionId}/status`,
    config.gatewayUrl
  );

  const response = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${clientToken}`,
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    throw AuthboundError.fromResponse(response);
  }

  return response.json();
}
