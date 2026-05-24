import type { Request, RequestHandler, Response } from "express";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AuthboundConfig } from "../core/types";
import { authboundMiddleware, withAuthbound } from "./middleware";

const config: AuthboundConfig = {
  apiKey: `sk_test_${"x".repeat(32)}`,
  publishableKey: `pk_test_${"x".repeat(32)}`,
  secret: "session-secret-at-least-32-characters",
  apiUrl: "https://api.authbound.test",
  routes: {
    protected: [{ path: "/protected", requirements: { verified: true } }],
    verify: "/verify",
  },
  debug: true,
};

const leakedValues = {
  apiKey: `sk_test_${"a".repeat(32)}`,
  bearer: "debug_bearer_token_secret",
  causeName: "cause_clientToken_secret_name",
  clientToken: "debug_clientToken_secret",
  errorName: "error_resultToken_secret_name",
  offer: "openid-credential-offer://debug-offer-token",
};

function createRequest(path = "/protected"): Request {
  return {
    path,
    originalUrl: path,
    get: (name: string) => (name.toLowerCase() === "host" ? "app.test" : ""),
  } as Request;
}

function createResponse(): Response {
  return {
    headersSent: false,
    redirect: vi.fn(),
    setHeader: vi.fn(),
  } as unknown as Response;
}

function createSecretBearingError(): Error {
  const cause = new Error(
    `Nested failure included credential_offer_uri=${leakedValues.offer}`
  );
  cause.name = leakedValues.causeName;

  const error = new Error(
    `API failed with clientToken=${leakedValues.clientToken} and key ${leakedValues.apiKey}`
  ) as Error & { cause?: unknown };
  error.name = leakedValues.errorName;
  error.stack = `Error: Authorization Bearer ${leakedValues.bearer}`;
  error.cause = cause;
  return error;
}

function serializeConsoleCalls(calls: unknown[][]): string {
  return JSON.stringify(calls, (_key, value) =>
    value instanceof Error
      ? {
          cause: value.cause,
          message: value.message,
          name: value.name,
          stack: value.stack,
        }
      : value
  );
}

async function runMiddleware(
  middleware: RequestHandler
): Promise<ReturnType<typeof vi.fn>> {
  const next = vi.fn();

  await Promise.resolve(middleware(createRequest(), createResponse(), next));

  return next;
}

describe("Express middleware security logging", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("redacts secret-bearing errors from route middleware debug logs", async () => {
    const error = createSecretBearingError();
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});

    const next = await runMiddleware(
      authboundMiddleware(config, {
        skip: () => {
          throw error;
        },
      })
    );

    const serializedLogs = serializeConsoleCalls(consoleError.mock.calls);

    expect(next).toHaveBeenCalledWith(error);
    for (const leakedValue of Object.values(leakedValues)) {
      expect(serializedLogs).not.toContain(leakedValue);
    }
    expect(serializedLogs).toContain("[redacted]");
  });

  it("redacts secret-bearing errors from simple middleware debug logs", async () => {
    const error = createSecretBearingError();
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});

    const next = await runMiddleware(
      withAuthbound(
        config,
        { verified: true },
        {
          skip: () => {
            throw error;
          },
        }
      )
    );

    const serializedLogs = serializeConsoleCalls(consoleError.mock.calls);

    expect(next).toHaveBeenCalledWith(error);
    for (const leakedValue of Object.values(leakedValues)) {
      expect(serializedLogs).not.toContain(leakedValue);
    }
    expect(serializedLogs).toContain("[redacted]");
  });
});
