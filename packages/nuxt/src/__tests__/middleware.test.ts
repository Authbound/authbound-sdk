import { afterEach, describe, expect, it, vi } from "vitest";

const runtimeConfig = vi.hoisted(() => ({
  current: {
    authbound: {},
    public: { authbound: {} },
  },
}));

vi.mock("nitropack/runtime", () => ({
  useRuntimeConfig: () => runtimeConfig.current,
}));

vi.mock("@authbound/server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@authbound/server")>();
  return {
    ...actual,
    verifyToken: vi.fn(),
  };
});

import { verifyToken } from "@authbound/server";
import middleware from "../runtime/server/middleware";

const mockedVerifyToken = vi.mocked(verifyToken);

const leakedValues = {
  apiKey: `sk_test_${"a".repeat(32)}`,
  bearer: "nuxt_middleware_bearer_token_secret",
  clientToken: "nuxt_middleware_client_token_secret",
  errorName: "nuxt_middleware_result_token_secret_name",
  offer:
    "openid4vp://authorize?request_uri=https%3A%2F%2Fapi.authbound.test%2Fsecret.jwt",
};

function createSecretBearingError(): Error {
  const error = new Error(
    `JWT verification failed with clientToken=${leakedValues.clientToken}, ${leakedValues.apiKey}, and ${leakedValues.offer}`
  );
  error.name = leakedValues.errorName;
  error.stack = `Error: Authorization Bearer ${leakedValues.bearer}`;
  return error;
}

function createEvent(path: string, cookie?: string) {
  const headers: Record<string, string> = {
    host: "example.test",
  };
  if (cookie) {
    headers.cookie = cookie;
  }

  const responseHeaders = new Map<string, string>();

  return {
    context: {},
    handled: false,
    method: "GET",
    path,
    node: {
      req: {
        connection: {},
        headers,
        method: "GET",
        originalUrl: path,
        url: path,
      },
      res: {
        body: undefined as string | undefined,
        statusCode: 200,
        getHeader(name: string) {
          return responseHeaders.get(name.toLowerCase());
        },
        setHeader(name: string, value: string) {
          responseHeaders.set(name.toLowerCase(), value);
        },
        end(body: string) {
          this.body = body;
        },
      },
    },
  };
}

describe("authbound Nuxt middleware", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("does not allow a protected route when a cookie is present but no session secret is configured", async () => {
    runtimeConfig.current = {
      authbound: {
        cookieName: "authbound_session",
        middleware: true,
        protectedRoutes: ["/dashboard"],
        publicRoutes: [],
      },
      public: {
        authbound: {
          debug: false,
          verifyPath: "/verify",
        },
      },
    };

    const event = createEvent("/dashboard", "authbound_session=forged");

    await middleware(event as never);

    expect(event.node.res.statusCode).toBe(302);
    expect(event.node.res.getHeader("location")).toBe(
      "http://example.test/verify?returnTo=%2Fdashboard"
    );
  });

  it("redacts secret-bearing session verification errors from debug logs", async () => {
    runtimeConfig.current = {
      authbound: {
        cookieName: "authbound_session",
        middleware: true,
        protectedRoutes: ["/dashboard"],
        publicRoutes: [],
        sessionSecret: "session-secret-at-least-32-characters",
      },
      public: {
        authbound: {
          debug: true,
          verifyPath: "/verify",
        },
      },
    };
    mockedVerifyToken.mockRejectedValue(createSecretBearingError());
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    vi.spyOn(console, "log").mockImplementation(() => {});

    const event = createEvent("/dashboard", "authbound_session=forged");

    await middleware(event as never);

    const serializedLogs = JSON.stringify(consoleError.mock.calls);
    expect(event.node.res.statusCode).toBe(302);
    expect(consoleError).toHaveBeenCalled();
    for (const leakedValue of Object.values(leakedValues)) {
      expect(serializedLogs).not.toContain(leakedValue);
    }
    expect(serializedLogs).toContain("[redacted]");
  });
});
