/**
 * HTTP utilities for Gateway API communication.
 *
 * Uses native fetch for Edge runtime compatibility.
 */

import { AuthboundError } from "../types/errors";
import type { ResolvedConfig } from "./config";

// ============================================================================
// Types
// ============================================================================

export interface RequestOptions {
  /** HTTP method */
  method?: "GET" | "POST" | "PUT" | "DELETE";
  /** Request body (will be JSON stringified) */
  body?: unknown;
  /** Additional headers */
  headers?: Record<string, string>;
  /** Override timeout */
  timeout?: number;
  /** Bearer token for authorization */
  token?: string;
}

export interface HttpResponse<T> {
  /** Response data */
  data: T;
  /** HTTP status code */
  status: number;
  /** Response headers */
  headers: Headers;
}

// ============================================================================
// HTTP Client
// ============================================================================

/**
 * Create an HTTP client for Gateway API calls.
 */
export function createHttpClient(config: ResolvedConfig) {
  const baseUrl = config.gatewayUrl;

  // Pre-compute the expected origin for SSRF validation
  const expectedOrigin = new URL(baseUrl).origin;

  /**
   * Make an HTTP request to the Gateway.
   */
  async function request<T>(
    path: string,
    options: RequestOptions = {}
  ): Promise<HttpResponse<T>> {
    const url = new URL(path, baseUrl);

    // SSRF Prevention: Validate that the resolved URL stays on the configured gateway
    // This prevents attacks where path="https://evil.com" overrides baseUrl
    if (url.origin !== expectedOrigin) {
      throw new AuthboundError(
        "config_invalid",
        `Invalid request URL: expected origin ${expectedOrigin}, got ${url.origin}. ` +
          "This may indicate an SSRF attempt or misconfigured path."
      );
    }

    const timeout = options.timeout ?? config.timeout;

    // Build headers
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Accept: "application/json",
      "X-Authbound-Client": "@authbound/core",
      ...options.headers,
    };

    if (options.token) {
      headers["Authorization"] = `Bearer ${options.token}`;
    }

    // Create abort controller for timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(url.toString(), {
        method: options.method ?? "GET",
        headers,
        body: options.body ? JSON.stringify(options.body) : undefined,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      // Parse response body
      let data: T;
      const contentType = response.headers.get("Content-Type");

      if (contentType?.includes("application/json")) {
        data = await response.json();
      } else {
        data = (await response.text()) as unknown as T;
      }

      // Handle error responses
      if (!response.ok) {
        throw AuthboundError.fromResponse(
          response,
          data as { code?: string; message?: string; details?: Record<string, unknown> }
        );
      }

      return {
        data,
        status: response.status,
        headers: response.headers,
      };
    } catch (error) {
      clearTimeout(timeoutId);

      // Handle abort (timeout)
      if (error instanceof Error && error.name === "AbortError") {
        throw new AuthboundError("network_error", "Request timed out", {
          details: { timeout, path },
        });
      }

      // Re-throw AuthboundErrors
      if (error instanceof AuthboundError) {
        throw error;
      }

      // Wrap other errors
      throw AuthboundError.from(error);
    }
  }

  /**
   * GET request.
   */
  async function get<T>(
    path: string,
    options?: Omit<RequestOptions, "method" | "body">
  ): Promise<HttpResponse<T>> {
    return request<T>(path, { ...options, method: "GET" });
  }

  /**
   * POST request.
   */
  async function post<T>(
    path: string,
    body?: unknown,
    options?: Omit<RequestOptions, "method" | "body">
  ): Promise<HttpResponse<T>> {
    return request<T>(path, { ...options, method: "POST", body });
  }

  return {
    request,
    get,
    post,
    baseUrl,
  };
}

export type HttpClient = ReturnType<typeof createHttpClient>;

// ============================================================================
// Session Endpoint Client
// ============================================================================

/**
 * Create a client for your server's session endpoint.
 *
 * This is used by browser code to create sessions through your backend,
 * which then uses the secret key to call the Gateway.
 */
export function createSessionClient(config: ResolvedConfig) {
  const endpoint = config.sessionEndpoint;

  /**
   * Create a verification session through your server.
   */
  async function createSession(options: {
    policyId: string;
    customerUserRef?: string;
    metadata?: Record<string, string>;
  }): Promise<{
    sessionId: string;
    authorizationRequestUrl: string;
    clientToken: string;
    expiresAt: string;
    deepLink?: string;
  }> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), config.timeout);

    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(options),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw AuthboundError.fromResponse(response, body);
      }

      return await response.json();
    } catch (error) {
      clearTimeout(timeoutId);

      if (error instanceof AuthboundError) {
        throw error;
      }

      throw new AuthboundError(
        "session_create_failed",
        error instanceof Error ? error.message : "Failed to create session"
      );
    }
  }

  return {
    createSession,
  };
}

export type SessionClient = ReturnType<typeof createSessionClient>;
