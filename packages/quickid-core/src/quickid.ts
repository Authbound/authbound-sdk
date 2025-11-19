// packages/quickid-core/src/quickid.ts

import type {
  CreateSessionInput,
  QuickIDConfig,
  QuickIDEvent,
  QuickIdResult,
  QuickIdSession,
} from "./types";
import { QuickIdSessionSchema, ApiErrorSchema } from "./schemas";
import { z } from "zod";

export type QuickIDErrorCode =
  | "NO_FETCH"
  | "NO_SESSION"
  | "NO_UPLOADER"
  | "HTTP_ERROR"
  | "PARSING_ERROR";

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
      // Node 16+ / modern runtimes support Error.cause
      this.cause = options.cause;
    }
  }
}

/**
 * Lightweight client for the QuickID backend.
 *
 * This class is framework-agnostic and browser-first.
 * React/Vue bindings should wrap this instead of talking to the API directly.
 */
export class QuickID {
  private readonly config: QuickIDConfig;
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;
  private sessionId?: string;

  constructor(config: QuickIDConfig) {
    this.config = {
      pollIntervalMs: 1500,
      defaultLevel: "standard",
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
   * Returns the current session id (if any).
   */
  get currentSessionId(): string | undefined {
    return this.sessionId;
  }

  /**
   * Creates a new QuickID session.
   * Must be called before uploadDocument/uploadSelfie/verify.
   */
  async createSession(input: CreateSessionInput = {}): Promise<QuickIdSession> {
    const body: CreateSessionInput = {
      level: input.level ?? this.config.defaultLevel ?? "standard",
      userHint: input.userHint,
      redirectUrl: input.redirectUrl,
      metadata: input.metadata,
    };

    const session = await this.request(
      "/api/quickid/sessions",
      {
        method: "POST",
        body: JSON.stringify(body),
        headers: { "Content-Type": "application/json" },
      },
      QuickIdSessionSchema
    );

    this.sessionId = session.id;
    return session;
  }

  /**
   * Uploads a document photo via the configured file uploader,
   * then notifies the backend that the document is attached.
   *
   * @param file The file to upload
   * @param side 'front' or 'back' (defaults to 'front')
   */
  async uploadDocument(
    file: File,
    side: "front" | "back" = "front"
  ): Promise<QuickIdSession> {
    const sessionId = this.ensureSession();
    const uploader = this.ensureUploader();

    const documentUrl = await uploader(file);

    const session = await this.request(
      `/api/quickid/sessions/${encodeURIComponent(sessionId)}/document`,
      {
        method: "POST",
        body: JSON.stringify({ documentUrl, side }),
        headers: { "Content-Type": "application/json" },
      },
      QuickIdSessionSchema
    );

    return session;
  }

  /**
   * Uploads a selfie via the configured file uploader,
   * then notifies the backend that the selfie is attached.
   */
  async uploadSelfie(file: File): Promise<QuickIdSession> {
    const sessionId = this.ensureSession();
    const uploader = this.ensureUploader();

    const selfieUrl = await uploader(file);

    const session = await this.request(
      `/api/quickid/sessions/${encodeURIComponent(sessionId)}/selfie`,
      {
        method: "POST",
        body: JSON.stringify({ selfieUrl }),
        headers: { "Content-Type": "application/json" },
      },
      QuickIdSessionSchema
    );

    return session;
  }

  /**
   * Explicitly triggers verification for the current session.
   * Depending on backend implementation, this might also happen automatically.
   */
  async verify(): Promise<QuickIdSession> {
    const sessionId = this.ensureSession();

    const session = await this.request(
      `/api/quickid/sessions/${encodeURIComponent(sessionId)}/verify`,
      {
        method: "POST",
      },
      QuickIdSessionSchema
    );

    return session;
  }

  /**
   * Fetches the latest session state from the backend.
   */
  async getStatus(): Promise<QuickIdSession> {
    const sessionId = this.ensureSession();

    const session = await this.request(
      `/api/quickid/sessions/${encodeURIComponent(sessionId)}`,
      {
        method: "GET",
      },
      QuickIdSessionSchema
    );

    return session;
  }

  /**
   * Convenience polling helper. Yields events until the session
   * reaches a terminal state (verified/failed) or an error is thrown.
   */
  async *pollStatus(
    intervalMs: number = this.config.pollIntervalMs ?? 1500
  ): AsyncGenerator<QuickIDEvent> {
    this.ensureSession();

    // eslint-disable-next-line no-constant-condition
    while (true) {
      const session = await this.getStatus();

      if (session.status === "processing") {
        yield { type: "PROCESSING", session };
      }

      if (session.status === "verified" && session.result) {
        yield {
          type: "VERIFIED",
          session,
          result: session.result as QuickIdResult,
        };
        return;
      }

      if (session.status === "failed") {
        yield {
          type: "FAILED",
          session,
          error: session.errorCode ?? "verification_failed",
        };
        return;
      }

      await this.sleep(intervalMs);
    }
  }

  /**
   * Internal helper for HTTP requests with Zod validation.
   */
  private async request<T>(
    path: string,
    init: RequestInit,
    schema: z.ZodType<T>
  ): Promise<T> {
    const url = `${this.baseUrl}${path}`;

    const headers: HeadersInit = {
      ...(init.headers ?? {}),
    };

    if (this.config.token) {
      (
        headers as Record<string, string>
      ).Authorization = `Bearer ${this.config.token}`;
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

  private ensureSession(): string {
    if (!this.sessionId) {
      throw new QuickIDError(
        "NO_SESSION",
        "No QuickID session. Call createSession() first."
      );
    }
    return this.sessionId;
  }

  private ensureUploader() {
    if (!this.config.upload) {
      throw new QuickIDError(
        "NO_UPLOADER",
        "No upload function configured. Provide config.upload to QuickID constructor."
      );
    }
    return this.config.upload;
  }

  private async sleep(ms: number): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, ms));
  }
}
