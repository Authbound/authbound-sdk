import type { z } from "zod";
import type { VerificationResultSchema } from "./schemas";

// Re-export types from core
export type {
  AssuranceLevel,
  BiometricData,
  DocumentData,
  ErrorDetail,
  VerificationStatus,
} from "@authbound-sdk/core";

// Re-export VerificationResult type inferred from schema
export type VerificationResult = z.infer<typeof VerificationResultSchema>;

export interface QuickIDConfig {
  /**
   * Base URL of the QuickID backend, e.g. "https://quickid.authbound.com"
   * Do not include trailing slash.
   */
  apiBaseUrl: string;

  /**
   * Polling interval for pollStatus (in ms). Default: 1500.
   */
  pollIntervalMs?: number;

  /**
   * Custom fetch implementation (for testing or specialized runtimes).
   * Defaults to globalThis.fetch.
   */
  fetch?: typeof fetch;
}

export type QuickIDPhase =
  | "idle"
  | "awaiting_document"
  | "awaiting_selfie"
  | "verifying"
  | "done";
