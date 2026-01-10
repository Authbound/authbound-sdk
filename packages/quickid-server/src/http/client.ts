/**
 * Internal HTTP client for QuickID API communication
 */

import {
  QuickIDAPIError,
  QuickIDAuthenticationError,
  QuickIDConnectionError,
} from "../errors";

export interface HttpClientConfig {
  /** API key for authentication */
  apiKey: string;
  /** Base URL of the API */
  baseUrl: string;
  /** Request timeout in milliseconds */
  timeout: number;
  /** Custom fetch implementation */
  fetch: typeof fetch;
}

export interface RequestOptions {
  method: "GET" | "POST" | "PATCH" | "DELETE";
  path: string;
  body?: unknown;
  headers?: Record<string, string>;
}

/**
 * Internal HTTP client for making API requests
 */
export class HttpClient {
  private readonly config: HttpClientConfig;

  constructor(config: HttpClientConfig) {
    this.config = config;
  }

  /**
   * Make an API request
   */
  async request<T>(options: RequestOptions): Promise<T> {
    const url = `${this.config.baseUrl}${options.path}`;

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${this.config.apiKey}`,
      "User-Agent": "authbound-quickid-server/0.1.0",
      ...options.headers,
    };

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.config.timeout);

    try {
      const response = await this.config.fetch(url, {
        method: options.method,
        headers,
        body: options.body ? JSON.stringify(options.body) : undefined,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      // Handle error responses
      if (!response.ok) {
        // 401 specifically means invalid API key
        if (response.status === 401) {
          throw new QuickIDAuthenticationError();
        }

        throw await QuickIDAPIError.fromResponse(response);
      }

      // Parse JSON response
      const data = await response.json();
      return data as T;
    } catch (error) {
      clearTimeout(timeoutId);

      // Re-throw our own errors
      if (
        error instanceof QuickIDAPIError ||
        error instanceof QuickIDAuthenticationError
      ) {
        throw error;
      }

      // Handle abort (timeout)
      if (error instanceof Error && error.name === "AbortError") {
        throw new QuickIDConnectionError(
          `Request timed out after ${this.config.timeout}ms`,
          error
        );
      }

      // Handle network errors
      if (error instanceof TypeError) {
        throw new QuickIDConnectionError(
          `Network error: ${error.message}`,
          error
        );
      }

      // Unknown error
      throw new QuickIDConnectionError(
        error instanceof Error ? error.message : "Unknown error occurred",
        error
      );
    }
  }

  /**
   * GET request
   */
  async get<T>(path: string, headers?: Record<string, string>): Promise<T> {
    return this.request<T>({ method: "GET", path, headers });
  }

  /**
   * POST request
   */
  async post<T>(
    path: string,
    body?: unknown,
    headers?: Record<string, string>
  ): Promise<T> {
    return this.request<T>({ method: "POST", path, body, headers });
  }

  /**
   * PATCH request
   */
  async patch<T>(
    path: string,
    body?: unknown,
    headers?: Record<string, string>
  ): Promise<T> {
    return this.request<T>({ method: "PATCH", path, body, headers });
  }

  /**
   * DELETE request
   */
  async delete<T>(path: string, headers?: Record<string, string>): Promise<T> {
    return this.request<T>({ method: "DELETE", path, headers });
  }
}
