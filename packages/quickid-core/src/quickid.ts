import type { QuickIDConfig, VerificationResult } from "./types";
import { VerificationResultSchema, ApiErrorSchema } from "./schemas";
import { z } from "zod";

export type QuickIDErrorCode =
  | "NO_FETCH"
  | "HTTP_ERROR"
  | "PARSING_ERROR"
  | "VALIDATION_ERROR";

export class QuickIDError extends Error {
  readonly code: QuickIDErrorCode;
  readonly status?: number;
  readonly details?: unknown;

  constructor(
    code: QuickIDErrorCode,
    message: string,
    options?: { status?: number; details?: unknown; cause?: unknown }
  ) {
    super(message);
    this.name = "QuickIDError";
    this.code = code;
    this.status = options?.status;
    this.details = options?.details;

    if (options?.cause) {
      this.cause = options.cause;
    }
  }
}

const MAX_FILE_SIZE_MB = 10;
const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;
const ALLOWED_MIME_TYPES = ["image/jpeg", "image/png", "image/jpg"];

/**
 * Client for the QuickID backend.
 */
export class QuickID {
  private readonly config: QuickIDConfig;
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;

  constructor(config: QuickIDConfig) {
    this.config = {
      pollIntervalMs: 1500,
      ...config,
    };

    this.baseUrl = this.config.apiBaseUrl.replace(/\/+$/, "");
    this.fetchImpl = this.config.fetch ?? globalThis.fetch;

    if (!this.fetchImpl) {
      throw new QuickIDError(
        "NO_FETCH",
        "No fetch implementation available. Provide config.fetch or run in an environment with global fetch."
      );
    }
  }

  /**
   * Submits the document and selfie for verification.
   *
   * @param clientToken The short-lived session token provided by your backend.
   * @param document The document image file (Passport/ID).
   * @param selfie The selfie image file.
   */
  async submitVerification(
    clientToken: string,
    document: File,
    selfie: File
  ): Promise<VerificationResult> {
    this.validateFile(document, "document");
    this.validateFile(selfie, "selfie");

    const formData = new FormData();
    formData.append("passport_image", document);
    formData.append("selfie_image", selfie);

    const result = await this.request(
      "/verify",
      {
        method: "POST",
        body: formData, // fetch will set Content-Type: multipart/form-data automatically
      },
      VerificationResultSchema,
      clientToken
    );

    return result;
  }

  /**
   * Fetches the current status of the session.
   * Useful if the initial verification returns PENDING.
   */
  async getSessionResult(
    clientToken: string,
    sessionId: string
  ): Promise<VerificationResult> {
    return this.request(
      `/sessions/${encodeURIComponent(sessionId)}`,
      {
        method: "GET",
      },
      VerificationResultSchema,
      clientToken
    );
  }

  /**
   * Polls the session status until it is no longer PENDING.
   */
  async *pollResult(
    clientToken: string,
    sessionId: string,
    intervalMs: number = this.config.pollIntervalMs ?? 1500
  ): AsyncGenerator<VerificationResult> {
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const result = await this.getSessionResult(clientToken, sessionId);

      yield result;

      if (result.status !== "PENDING") {
        return;
      }

      await this.sleep(intervalMs);
    }
  }

  private validateFile(file: File, label: string) {
    if (!file) {
      throw new QuickIDError("VALIDATION_ERROR", `${label} file is missing`);
    }
    if (file.size > MAX_FILE_SIZE_BYTES) {
      throw new QuickIDError(
        "VALIDATION_ERROR",
        `${label} file size exceeds ${MAX_FILE_SIZE_MB}MB limit`
      );
    }
    if (!ALLOWED_MIME_TYPES.includes(file.type)) {
      throw new QuickIDError(
        "VALIDATION_ERROR",
        `${label} file type ${file.type} is not supported. Use JPG or PNG.`
      );
    }
  }

  private async request<T>(
    path: string,
    init: RequestInit,
    schema: z.ZodType<T>,
    token?: string
  ): Promise<T> {
    const url = `${this.baseUrl}${path}`;

    const headers: HeadersInit = {
      ...(init.headers ?? {}),
    };

    if (token) {
      (headers as Record<string, string>).Authorization = `Bearer ${token}`;
    }

    let res: Response;
    try {
      res = await this.fetchImpl(url, {
        ...init,
        headers,
      });
    } catch (err) {
      throw new QuickIDError("HTTP_ERROR", `QuickID request failed: ${url}`, {
        cause: err,
      });
    }

    let json: unknown;
    try {
      json = await res.json();
    } catch {
      // ignore; may not be JSON
    }

    if (!res.ok) {
      // Try to parse standard error format
      const parsedError = ApiErrorSchema.safeParse(json);
      if (parsedError.success) {
        throw new QuickIDError("HTTP_ERROR", parsedError.data.message, {
          status: res.status,
          details: parsedError.data,
        });
      }

      throw new QuickIDError(
        "HTTP_ERROR",
        `QuickID request failed with status ${res.status} (${res.statusText})`,
        { status: res.status, details: json }
      );
    }

    // Validate success response against schema
    const validation = schema.safeParse(json);
    if (!validation.success) {
      throw new QuickIDError(
        "PARSING_ERROR",
        "Failed to parse QuickID response",
        { details: validation.error }
      );
    }

    return validation.data;
  }

  private async sleep(ms: number): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, ms));
  }
}
