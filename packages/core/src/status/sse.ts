/**
 * Server-Sent Events subscription for real-time status updates.
 *
 * Uses fetch with ReadableStream instead of EventSource to allow
 * Authorization headers (preventing token exposure in URLs).
 */

import type { ResolvedConfig } from "../client/config";
import type { ClientToken, VerificationId } from "../types/branded";
import { AuthboundError } from "../types/errors";
import type { StatusEvent } from "../types/verification";
import {
  isTerminalVerificationUiStatus,
  projectVerificationStatusForUi,
} from "../types/verification-contract";
import { assertBrowserSafeStatusPayload } from "./browser-safe-status";

// ============================================================================
// Constants
// ============================================================================

/**
 * Maximum buffer size for SSE data (64KB).
 * Prevents memory exhaustion from malicious/buggy servers sending
 * unbounded data without proper event delimiters.
 * @internal Exported for testing
 */
export const MAX_BUFFER_SIZE = 64 * 1024;

const SENSITIVE_DEBUG_PATTERNS: [RegExp, string][] = [
  [/\bBearer\s+[^"',}\]\s]+/gi, "Bearer [redacted]"],
  [/\b(?:sk|whsec)_(?:live|test)?_?[A-Za-z0-9._=-]+/gi, "[redacted]"],
  [/\bopenid(?:4vp|-credential-offer):\/\/[^"',}\]\s]+/gi, "[redacted]"],
  [/\brequest_uri=[^&"',}\]\s]+/gi, "request_uri=[redacted]"],
  [
    /(["']?(?:client|result)[_-]?token["']?\s*[:=]\s*["']?)[^"',}\]\s]+/gi,
    "$1[redacted]",
  ],
  [
    /\b[A-Za-z0-9_-]*(?:client|result)[_-]?token[A-Za-z0-9_-]*\b/gi,
    "[redacted]",
  ],
];

function redactDebugText(value: string): string {
  return SENSITIVE_DEBUG_PATTERNS.reduce(
    (redacted, [pattern, replacement]) =>
      redacted.replace(pattern, replacement),
    value
  );
}

function redactDebugValue(
  value: unknown,
  seen = new WeakSet<object>(),
  depth = 0
): unknown {
  if (typeof value === "string") {
    return redactDebugText(value);
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
    const sanitized: Record<string, unknown> = {
      message: redactDebugText(value.message),
      name: redactDebugText(value.name),
    };
    if (value.stack) {
      sanitized.stack = redactDebugText(value.stack);
    }
    if (value.cause) {
      sanitized.cause = redactDebugValue(value.cause, seen, depth + 1);
    }
    for (const [key, entry] of Object.entries(value)) {
      if (key === "cause") {
        continue;
      }
      sanitized[redactDebugText(key)] = redactDebugValue(
        entry,
        seen,
        depth + 1
      );
    }
    return sanitized;
  }

  if (Array.isArray(value)) {
    return value.map((entry) => redactDebugValue(entry, seen, depth + 1));
  }

  return Object.fromEntries(
    Object.entries(value).map(([key, entry]) => [
      redactDebugText(key),
      redactDebugValue(entry, seen, depth + 1),
    ])
  );
}

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
  /** Initial cursor for replay (events after this ID will be returned) */
  afterCursor?: string;
}

/**
 * Parse SSE format from a chunk of text.
 * SSE format: "id: <cursor>\nevent: <type>\ndata: <json>\n\n"
 */
function parseSSEChunk(
  chunk: string
): Array<{ id?: string; event?: string; data: string }> {
  const events: Array<{ id?: string; event?: string; data: string }> = [];
  const lines = chunk.split("\n");

  let currentId: string | undefined;
  let currentEvent: string | undefined;
  let currentData: string[] = [];

  for (const line of lines) {
    if (line.startsWith("id:")) {
      currentId = line.slice(3).trim();
    } else if (line.startsWith("event:")) {
      currentEvent = line.slice(6).trim();
    } else if (line.startsWith("data:")) {
      currentData.push(line.slice(5).trim());
    } else if (line === "" && currentData.length > 0) {
      // Empty line marks end of event
      events.push({
        id: currentId,
        event: currentEvent,
        data: currentData.join("\n"),
      });
      currentId = undefined;
      currentEvent = undefined;
      currentData = [];
    }
  }

  return events;
}

/**
 * Map gateway status to SDK VerificationUiStatus.
 * Passes through known statuses directly and rejects unknown gateway states.
 */
function mapGatewayStatus(status: string): StatusEvent["status"] {
  return projectVerificationStatusForUi(status);
}

/**
 * Check if a status is terminal.
 */
function isTerminalStatus(status: string): boolean {
  return isTerminalVerificationUiStatus(projectVerificationStatusForUi(status));
}

async function fetchLatestStatus(
  config: ResolvedConfig,
  verificationId: VerificationId,
  clientToken: ClientToken
): Promise<StatusEvent | null> {
  const url = new URL(
    `/v1/verifications/${verificationId}/status`,
    config.gatewayUrl
  );

  const response = await fetch(url.toString(), {
    method: "GET",
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${clientToken}`,
      "x-authbound-publishable-key": config.publishableKey,
    },
  });

  if (!response.ok) {
    return null;
  }

  const data = (await response.json()) as {
    status?: string;
    error?: StatusEvent["error"];
  } & Record<string, unknown>;
  assertBrowserSafeStatusPayload(data);
  if (typeof data.status !== "string") {
    throw new AuthboundError(
      "verification_invalid_state",
      "Status response is missing a verification status"
    );
  }
  const status = mapGatewayStatus(data.status);

  return {
    type: data.error ? "error" : "status",
    status,
    ...(data.error ? { error: data.error } : {}),
    timestamp: new Date().toISOString(),
  };
}

/**
 * Create an SSE subscription for verification status updates.
 *
 * Uses fetch with ReadableStream to allow Authorization headers,
 * preventing token exposure in URL query parameters.
 *
 * @returns Cleanup function to close the connection
 */
export function createStatusSubscription(
  config: ResolvedConfig,
  verificationId: VerificationId,
  clientToken: ClientToken,
  onEvent: (event: StatusEvent) => void,
  options: SSESubscriptionOptions = {}
): () => void {
  const {
    onError,
    autoReconnect = true,
    maxReconnectAttempts = 5,
    afterCursor,
  } = options;

  let abortController: AbortController | null = null;
  let reconnectAttempts = 0;
  let isCleanedUp = false;
  let reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
  // Track last received event ID for cursor-based replay on reconnection
  let lastEventId: string | undefined = afterCursor;

  const baseUrl = new URL(
    `/v1/verifications/${verificationId}/events/sse`,
    config.gatewayUrl
  );

  async function connect(): Promise<void> {
    if (isCleanedUp) return;

    if (config.debug) {
      console.log(
        "[Authbound] Connecting to SSE:",
        verificationId,
        lastEventId ? `(after: ${lastEventId})` : ""
      );
    }

    abortController = new AbortController();

    // Build URL with optional cursor query parameter
    const url = new URL(baseUrl.toString());
    if (lastEventId) {
      url.searchParams.set("after", lastEventId);
    }

    // Build headers - include Last-Event-ID for reconnection replay
    const headers: Record<string, string> = {
      Accept: "text/event-stream",
      Authorization: `Bearer ${clientToken}`,
      "x-authbound-publishable-key": config.publishableKey,
    };
    if (lastEventId) {
      headers["Last-Event-ID"] = lastEventId;
    }

    try {
      const response = await fetch(url.toString(), {
        method: "GET",
        headers,
        signal: abortController.signal,
      });

      if (!response.ok) {
        throw await createSseResponseError(response);
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
        for (const { id, event, data } of events) {
          if (isCleanedUp) break;

          // Track event ID for cursor-based replay on reconnection
          if (id) {
            lastEventId = id;
          }

          // Skip heartbeat events (no data or empty)
          if (event === "heartbeat" || !data) {
            if (config.debug) {
              console.log("[Authbound] SSE heartbeat");
            }
            continue;
          }

          try {
            const parsed = JSON.parse(data) as Record<string, unknown>;
            // Map gateway status to SDK-friendly status
            let mappedStatus: StatusEvent["status"];
            try {
              assertBrowserSafeStatusPayload(parsed);
              mappedStatus = mapGatewayStatus(parsed.status as string);
            } catch (error) {
              const authboundError = AuthboundError.from(error);
              onEvent({
                type: "error",
                status: "error",
                error: {
                  code: authboundError.code,
                  message: authboundError.message,
                },
                timestamp: new Date().toISOString(),
              });
              cleanup();
              return;
            }
            // Build a complete StatusEvent — the gateway sends `updatedAt`
            // but the SDK schema expects `timestamp`
            const timestamp =
              (parsed.timestamp as string) ??
              (parsed.updatedAt as string) ??
              new Date().toISOString();
            const statusEvent: StatusEvent = {
              type:
                event === "heartbeat"
                  ? "heartbeat"
                  : parsed.error
                    ? "error"
                    : "status",
              status: mappedStatus,
              ...(parsed.error
                ? { error: parsed.error as StatusEvent["error"] }
                : {}),
              timestamp,
            };

            // Stop on terminal status (check raw status for terminal detection)
            if (isTerminalStatus(parsed.status as string)) {
              const finalEvent = statusEvent.error
                ? null
                : await fetchLatestStatus(config, verificationId, clientToken)
                    .then((event) => event)
                    .catch((error) => {
                      const authboundError = AuthboundError.from(error);
                      return {
                        type: "error" as const,
                        status: "error" as const,
                        error: {
                          code: authboundError.code,
                          message: authboundError.message,
                        },
                        timestamp: new Date().toISOString(),
                      };
                    });
              onEvent(finalEvent ?? statusEvent);
              cleanup();
              return;
            }

            onEvent(statusEvent);
          } catch (parseError) {
            if (config.debug) {
              console.error(
                "[Authbound] Failed to parse SSE event:",
                redactDebugValue(parseError),
                redactDebugValue(data)
              );
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
        console.log(
          "[Authbound] SSE connection error:",
          redactDebugValue(error)
        );
      }

      const authboundError = AuthboundError.from(error);

      if (
        authboundError.retryable &&
        autoReconnect &&
        reconnectAttempts < maxReconnectAttempts
      ) {
        scheduleReconnect();
      } else if (onError) {
        onError(authboundError);
      }
    }
  }

  function scheduleReconnect(): void {
    if (isCleanedUp) return;

    reconnectAttempts++;
    // Exponential backoff with jitter to prevent thundering herd
    const baseDelay = Math.min(1000 * 2 ** (reconnectAttempts - 1), 30_000);
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

async function createSseResponseError(
  response: Response
): Promise<AuthboundError> {
  const body = await readErrorBody(response);
  if (response.status === 503 && body?.code === "realtime_unavailable") {
    return new AuthboundError(
      "gateway_unavailable",
      body.message ??
        "Realtime verification events are temporarily unavailable",
      {
        details: { gatewayCode: body.code },
        retryable: false,
        statusCode: response.status,
      }
    );
  }

  return AuthboundError.fromResponse(response, body);
}

async function readErrorBody(response: Response): Promise<
  | {
      code?: string;
      message?: string;
      error?: string;
      details?: Record<string, unknown>;
      [key: string]: unknown;
    }
  | undefined
> {
  try {
    const body = (await response.json()) as unknown;
    return body && typeof body === "object" && !Array.isArray(body)
      ? (body as {
          code?: string;
          message?: string;
          error?: string;
          details?: Record<string, unknown>;
          [key: string]: unknown;
        })
      : undefined;
  } catch {
    return;
  }
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
