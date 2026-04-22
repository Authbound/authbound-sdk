import type { z } from "zod";
import type {
  AssuranceLevelSchema,
  BiometricDataSchema,
  DocumentDataSchema,
  ErrorDetailSchema,
  VerificationResultSchema,
  VerificationStatusSchema,
} from "./schemas";

export type VerificationStatus = z.infer<typeof VerificationStatusSchema>;
export type AssuranceLevel = z.infer<typeof AssuranceLevelSchema>;
export type DocumentData = z.infer<typeof DocumentDataSchema>;
export type BiometricData = z.infer<typeof BiometricDataSchema>;
export type ErrorDetail = z.infer<typeof ErrorDetailSchema>;

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
