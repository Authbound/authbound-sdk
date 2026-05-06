/**
 * Client configuration types and parsing.
 */

import { z } from "zod";
import type { PolicyId, PublishableKey } from "../types/branded";
import { isPolicyId, isPublishableKey } from "../types/branded";
import { AuthboundError } from "../types/errors";

// ============================================================================
// Configuration Schema
// ============================================================================

/**
 * SDK configuration options.
 */
export interface AuthboundClientConfig {
  /** Your publishable key (pk_live_... or pk_test_...) */
  publishableKey: PublishableKey;

  /** Default policy ID for verification (can be overridden per-call) */
  policyId?: PolicyId;

  /** Authbound API URL (defaults to production) */
  gatewayUrl?: string;

  /** Verification creation endpoint on your server */
  verificationEndpoint?: string;

  /** Verification session finalization endpoint on your server */
  sessionEndpoint?: string;

  /** Session handling mode: SDK cookie finalization or app-owned manual session */
  sessionMode?: "sdk" | "manual";

  /** Request timeout in milliseconds (default: 30000) */
  timeout?: number;

  /** Enable debug logging */
  debug?: boolean;
}

export const AuthboundClientConfigSchema = z.object({
  publishableKey: z.string().refine(isPublishableKey, {
    message:
      "Invalid publishable key format. Expected pk_live_... or pk_test_...",
  }),
  policyId: z.string().refine(isPolicyId, "Invalid policy ID").optional(),
  gatewayUrl: z.string().url().optional(),
  verificationEndpoint: z.string().optional(),
  sessionEndpoint: z.string().optional(),
  sessionMode: z.enum(["sdk", "manual"]).optional(),
  timeout: z.number().int().positive().optional(),
  debug: z.boolean().optional(),
});

// ============================================================================
// Default Configuration
// ============================================================================

/**
 * Default configuration values.
 */
export const DEFAULT_CONFIG = {
  gatewayUrl: "https://api.authbound.io",
  verificationEndpoint: "/api/authbound/verification",
  sessionEndpoint: "/api/authbound/session",
  sessionMode: "sdk",
  timeout: 30_000,
  debug: false,
} as const;

// ============================================================================
// Configuration Parsing
// ============================================================================

/**
 * Resolved configuration with all defaults applied.
 */
export interface ResolvedConfig {
  publishableKey: PublishableKey;
  policyId?: PolicyId;
  gatewayUrl: string;
  verificationEndpoint: string;
  sessionEndpoint: string;
  sessionMode: "sdk" | "manual";
  timeout: number;
  debug: boolean;
  environment: "live" | "test";
}

/**
 * Parse and validate configuration, applying defaults.
 */
export function resolveConfig(config: AuthboundClientConfig): ResolvedConfig {
  // Validate config
  const result = AuthboundClientConfigSchema.safeParse(config);

  if (!result.success) {
    const issue = result.error.issues[0];
    throw new AuthboundError(
      "config_invalid",
      `Invalid configuration: ${issue?.path.join(".")}: ${issue?.message}`,
      { details: { issues: result.error.issues } }
    );
  }

  const validated = result.data;

  // Determine environment from key
  const environment = validated.publishableKey.includes("_live_")
    ? "live"
    : "test";

  return {
    publishableKey: validated.publishableKey as PublishableKey,
    policyId: validated.policyId as PolicyId | undefined,
    gatewayUrl: validated.gatewayUrl ?? DEFAULT_CONFIG.gatewayUrl,
    verificationEndpoint:
      validated.verificationEndpoint ?? DEFAULT_CONFIG.verificationEndpoint,
    sessionEndpoint:
      validated.sessionEndpoint ?? DEFAULT_CONFIG.sessionEndpoint,
    sessionMode: validated.sessionMode ?? DEFAULT_CONFIG.sessionMode,
    timeout: validated.timeout ?? DEFAULT_CONFIG.timeout,
    debug: validated.debug ?? DEFAULT_CONFIG.debug,
    environment,
  };
}

/**
 * Get configuration from environment variables.
 *
 * Looks for:
 * - NEXT_PUBLIC_AUTHBOUND_PK / NUXT_PUBLIC_AUTHBOUND_PK / AUTHBOUND_PK
 * - AUTHBOUND_API_URL
 *
 * Note: This function is environment-agnostic and won't throw in browsers.
 */
export function getConfigFromEnv(): Partial<AuthboundClientConfig> {
  const config: Partial<AuthboundClientConfig> = {};

  // Safe environment variable access (works in browser + Node)
  const getEnvVar = (key: string): string | undefined => {
    try {
      // Use globalThis to access process safely
      const proc = (
        globalThis as { process?: { env?: Record<string, string | undefined> } }
      ).process;
      return proc?.env?.[key];
    } catch {
      return;
    }
  };

  // Try different environment variable prefixes
  const pkKey =
    getEnvVar("NEXT_PUBLIC_AUTHBOUND_PK") ??
    getEnvVar("NUXT_PUBLIC_AUTHBOUND_PK") ??
    getEnvVar("AUTHBOUND_PK");

  if (pkKey && isPublishableKey(pkKey)) {
    config.publishableKey = pkKey;
  }

  const gatewayUrl = getEnvVar("AUTHBOUND_API_URL");

  if (gatewayUrl) {
    config.gatewayUrl = gatewayUrl;
  }

  return config;
}
