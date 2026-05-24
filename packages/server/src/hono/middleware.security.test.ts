import { Hono } from "hono";
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

function selectAuthboundLogCalls(calls: unknown[][]): unknown[][] {
  return calls.filter(
    ([message]) =>
      typeof message === "string" && message.startsWith("[Authbound]")
  );
}

async function requestWithMiddleware(
  middleware: ReturnType<typeof authboundMiddleware>
): Promise<Response> {
  const app = new Hono();
  app.use("*", middleware);
  app.get("/protected", (context) => context.text("ok"));

  return app.request("http://app.test/protected");
}

describe("Hono middleware security logging", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("redacts secret-bearing errors from route middleware debug logs", async () => {
    const error = createSecretBearingError();
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});

    const response = await requestWithMiddleware(
      authboundMiddleware(config, {
        skip: () => {
          throw error;
        },
      })
    );

    const authboundLogCalls = selectAuthboundLogCalls(consoleError.mock.calls);
    const serializedLogs = serializeConsoleCalls(authboundLogCalls);

    expect(response.status).toBe(500);
    expect(authboundLogCalls.length).toBeGreaterThan(0);
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

    const response = await requestWithMiddleware(
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

    const authboundLogCalls = selectAuthboundLogCalls(consoleError.mock.calls);
    const serializedLogs = serializeConsoleCalls(authboundLogCalls);

    expect(response.status).toBe(500);
    expect(authboundLogCalls.length).toBeGreaterThan(0);
    for (const leakedValue of Object.values(leakedValues)) {
      expect(serializedLogs).not.toContain(leakedValue);
    }
    expect(serializedLogs).toContain("[redacted]");
  });
});
