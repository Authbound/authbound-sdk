import { verifyToken } from "@authbound/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { type AuthboundNextRequest, withAuthbound } from "../middleware";

vi.mock("@authbound/server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@authbound/server")>();
  return {
    ...actual,
    verifyToken: vi.fn(),
  };
});

const mockedVerifyToken = vi.mocked(verifyToken);

const leakedValues = {
  apiKey: `sk_test_${"a".repeat(32)}`,
  bearer: "next_middleware_bearer_token_secret",
  clientToken: "next_middleware_client_token_secret",
  errorName: "next_middleware_result_token_secret_name",
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

function createRequest(): AuthboundNextRequest {
  const url = "https://app.authbound.test/protected?step=wallet";
  return Object.assign(new Request(url), {
    nextUrl: {
      pathname: "/protected",
      search: "?step=wallet",
    },
    cookies: {
      get: (name: string) =>
        name === "__authbound"
          ? { value: "encrypted_session_cookie_value" }
          : undefined,
    },
  });
}

describe("Next.js middleware security logging", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("redacts secret-bearing session verification errors from debug logs", async () => {
    mockedVerifyToken.mockRejectedValue(createSecretBearingError());
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    vi.spyOn(console, "log").mockImplementation(() => {});

    const middleware = withAuthbound({
      debug: true,
      secret: "session-secret-at-least-32-characters",
    });

    const response = await middleware(createRequest());
    const serializedLogs = JSON.stringify(consoleError.mock.calls);

    expect(response.status).toBe(307);
    expect(consoleError).toHaveBeenCalled();
    for (const leakedValue of Object.values(leakedValues)) {
      expect(serializedLogs).not.toContain(leakedValue);
    }
    expect(serializedLogs).toContain("[redacted]");
  });
});
