import { z } from "zod";
import type {
  QuickIdLevelSchema,
  QuickIdStatusSchema,
  QuickIdResultSchema,
  QuickIdSessionSchema,
  CreateSessionInputSchema,
} from "./schemas";

// Re-export types inferred from Zod schemas
export type QuickIdLevel = z.infer<typeof QuickIdLevelSchema>;
export type QuickIdStatus = z.infer<typeof QuickIdStatusSchema>;
export type QuickIdResult = z.infer<typeof QuickIdResultSchema>;
export type QuickIdSession = z.infer<typeof QuickIdSessionSchema>;
export type CreateSessionInput = z.infer<typeof CreateSessionInputSchema>;

/**
 * Strategy for uploading files (document / selfie) to storage.
 * Returns a URL that the QuickID backend can later access.
 *
 * You plug in your own implementation, e.g.:
 *  - S3 / R2 presigned URL uploader
 *  - Your own `POST /uploads` endpoint
 */
export type QuickIDFileUploader = (file: File) => Promise<string>;

export interface QuickIDConfig {
  /**
   * Base URL of the QuickID backend, e.g. "https://quickid.authbound.com"
   * Do not include trailing slash.
   */
  apiBaseUrl: string;

  /**
   * Optional bearer token or other auth header value.
   * If provided, QuickIDCore will send `Authorization: Bearer <token>`.
   */
  token?: string;

  /**
   * Optional function that uploads a File and returns a URL.
   * If not provided, calls to uploadDocument/uploadSelfie will throw.
   */
  upload?: QuickIDFileUploader;

  /**
   * Default verification level used when CreateSessionInput.level is omitted.
   */
  defaultLevel?: QuickIdLevel;

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

/**
 * High-level client-side phase for UI state.
 * This is separate from the backend session.status.
 */
export type QuickIDPhase =
  | "idle"
  | "creating_session"
  | "awaiting_document"
  | "awaiting_selfie"
  | "verifying"
  | "done";

export type QuickIDEvent =
  | { type: "SESSION_CREATED"; session: QuickIdSession }
  | { type: "DOCUMENT_UPLOADED"; session: QuickIdSession }
  | { type: "SELFIE_UPLOADED"; session: QuickIdSession }
  | { type: "PROCESSING"; session: QuickIdSession }
  | { type: "VERIFIED"; session: QuickIdSession; result: QuickIdResult }
  | { type: "FAILED"; session: QuickIdSession; error: string };
