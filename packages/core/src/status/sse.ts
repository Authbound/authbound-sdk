/**
 * Server-Sent Events subscription for real-time status updates.
 *
 * Uses fetch with ReadableStream instead of EventSource to allow
 * Authorization headers (preventing token exposure in URLs).
 */

import type { SessionId, ClientToken } from "../types/branded";
import type { StatusEvent } from "../types/verification";
import { AuthboundError } from "../types/errors";
import type { ResolvedConfig } from "../client/config";

// ============================================================================
// Constants
// ============================================================================

/**
 * Maximum buffer size for SSE data (64KB).
 * Prevents memory exhaustion from malicious/buggy servers sending
 * unbounded data without proper event delimiters.
 */
const MAX_BUFFER_SIZE = 64 * 1024;

// ============================================================================
// SSE Subscription
// ============================================================================

export interface SSESubscriptionOptions {
  /** Called when an error occurs */
  onError?: (error: AuthboundError) => void;
  /** Reconnect on connection loss (default: true) */
  autoReconnect?: boolean;
  /** Maximum reconnection attempts (default: 5) */
  maxReconnectAttempts?: number;
}

/**
 * Parse SSE format from a chunk of text.
 * SSE format: "event: <type>\ndata: <json>\n\n"
 */
function parseSSEChunk(chunk: string): Array<{ event?: string; data: string }> {
  const events: Array<{ event?: string; data: string }> = [];
  const lines = chunk.split("\n");

  let currentEvent: string | undefined;
  let currentData: string[] = [];

  for (const line of lines) {
    if (line.startsWith("event:")) {
      currentEvent = line.slice(6).trim();
    } else if (line.startsWith("data:")) {
      currentData.push(line.slice(5).trim());
    } else if (line === "" && currentData.length > 0) {
      // Empty line marks end of event
      events.push({
        event: currentEvent,
        data: currentData.join("\n"),
      });
      currentEvent = undefined;
      currentData = [];
    }
  }

  return events;
}

/**
 * Check if a status is terminal (session complete).
 */
function isTerminalStatus(status: string): boolean {
  return (
    status === "verified" ||
    status === "failed" ||
    status === "timeout" ||
    status === "error"
  );
}

/**
 * Create an SSE subscription for session status updates.
 *
 * Uses fetch with ReadableStream to allow Authorization headers,
 * preventing token exposure in URL query parameters.
 *
 * @returns Cleanup function to close the connection
 */
export function createStatusSubscription(
  config: ResolvedConfig,
  sessionId: SessionId,
  clientToken: ClientToken,
  onEvent: (event: StatusEvent) => void,
  options: SSESubscriptionOptions = {}
): () => void {
  const {
    onError,
    autoReconnect = true,
    maxReconnectAttempts = 5,
  } = options;

  let abortController: AbortController | null = null;
  let reconnectAttempts = 0;
  let isCleanedUp = false;
  let reconnectTimeout: ReturnType<typeof setTimeout> | null = null;

  const url = new URL(
    `/v1/sessions/${sessionId}/status/sse`,
    config.gatewayUrl
  );

  async function connect(): Promise<void> {
    if (isCleanedUp) return;

    if (config.debug) {
      console.log("[Authbound] Connecting to SSE:", sessionId);
    }

    abortController = new AbortController();

    try {
      const response = await fetch(url.toString(), {
        method: "GET",
        headers: {
          Accept: "text/event-stream",
          "Cache-Control": "no-cache",
          // Token in Authorization header - NOT in URL
          Authorization: `Bearer ${clientToken}`,
        },
        signal: abortController.signal,
      });

      if (!response.ok) {
        throw new AuthboundError(
          "network_error",
          `SSE connection failed: ${response.status} ${response.statusText}`
        );
      }

      if (!response.body) {
        throw new AuthboundError("network_error", "No response body for SSE");
      }

      if (config.debug) {
        console.log("[Authbound] SSE connected");
      }
      reconnectAttempts = 0;

      // Read the stream
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        if (isCleanedUp) break;

        const { done, value } = await reader.read();

        if (done) {
          if (config.debug) {
            console.log("[Authbound] SSE stream ended");
          }
          break;
        }

        // Decode and buffer the chunk
        buffer += decoder.decode(value, { stream: true });

        // Prevent memory exhaustion from unbounded buffer growth
        if (buffer.length > MAX_BUFFER_SIZE) {
          throw new AuthboundError(
            "network_error",
            "SSE buffer overflow - server sent too much data without event delimiters"
          );
        }

        // Parse complete events from buffer
        const events = parseSSEChunk(buffer);

        // Keep incomplete data in buffer
        const lastDoubleNewline = buffer.lastIndexOf("\n\n");
        if (lastDoubleNewline !== -1) {
          buffer = buffer.slice(lastDoubleNewline + 2);
        }

        // Process events
        for (const { event, data } of events) {
          if (isCleanedUp) break;

          // Skip heartbeat events (no data or empty)
          if (event === "heartbeat" || !data) {
            if (config.debug) {
              console.log("[Authbound] SSE heartbeat");
            }
            continue;
          }

          try {
            const parsed = JSON.parse(data) as StatusEvent;
            const eventWithType = event
              ? { ...parsed, type: event as StatusEvent["type"] }
              : parsed;

            onEvent(eventWithType);

            // Stop on terminal status
            if (isTerminalStatus(eventWithType.status)) {
              cleanup();
              return;
            }
          } catch (parseError) {
            if (config.debug) {
              console.error("[Authbound] Failed to parse SSE event:", parseError, data);
            }
          }
        }
      }

      // Stream ended without terminal event - try to reconnect
      if (!isCleanedUp && autoReconnect) {
        scheduleReconnect();
      }
    } catch (error) {
      if (isCleanedUp) return;

      // Ignore abort errors (intentional cleanup)
      if (error instanceof Error && error.name === "AbortError") {
        return;
      }

      if (config.debug) {
        console.log("[Authbound] SSE connection error:", error);
      }

      if (autoReconnect && reconnectAttempts < maxReconnectAttempts) {
        scheduleReconnect();
      } else {
        const authboundError =
          error instanceof AuthboundError
            ? error
            : new AuthboundError(
                "network_error",
                "SSE connection failed after maximum reconnection attempts"
              );

        if (onError) {
          onError(authboundError);
        }
      }
    }
  }

  function scheduleReconnect(): void {
    if (isCleanedUp) return;

    reconnectAttempts++;
    // Exponential backoff with jitter to prevent thundering herd
    const baseDelay = Math.min(1000 * Math.pow(2, reconnectAttempts - 1), 30000);
    const jitter = Math.random() * 1000; // 0-1000ms random jitter
    const delay = baseDelay + jitter;

    if (config.debug) {
      console.log(
        `[Authbound] Reconnecting in ${Math.round(delay)}ms (attempt ${reconnectAttempts}/${maxReconnectAttempts})`
      );
    }

    reconnectTimeout = setTimeout(() => {
      reconnectTimeout = null;
      connect();
    }, delay);
  }

  function cleanup(): void {
    isCleanedUp = true;

    if (reconnectTimeout) {
      clearTimeout(reconnectTimeout);
      reconnectTimeout = null;
    }

    if (abortController) {
      abortController.abort();
      abortController = null;
    }

    if (config.debug) {
      console.log("[Authbound] SSE subscription cleaned up");
    }
  }

  // Start connection
  connect();

  // Return cleanup function
  return cleanup;
}

/**
 * Check if streaming fetch is supported in the current environment.
 * This replaces the old EventSource check since we now use fetch.
 */
export function isSSESupported(): boolean {
  return (
    typeof fetch !== "undefined" &&
    typeof ReadableStream !== "undefined" &&
    typeof AbortController !== "undefined"
  );
}
