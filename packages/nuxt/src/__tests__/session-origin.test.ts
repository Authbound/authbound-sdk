import { beforeEach, describe, expect, it, vi } from "vitest";

const runtimeConfig = vi.hoisted(() => ({
  current: {
    authbound: {},
    public: { authbound: {} },
  },
}));

const authboundServer = vi.hoisted(() => ({
  AuthboundClient: vi.fn(function AuthboundClient() {
    return {
      verifications: {
        getResult: vi.fn(async () => ({
          resultToken: "signed_result_token",
          status: "verified",
          verificationId: "vrf_test123",
        })),
      },
    };
  }),
  AuthboundClientError: class AuthboundClientError extends Error {},
  createToken: vi.fn(async () => "verified-session-token"),
  finalizeSessionHandlerKernel: vi.fn(
    async (input: { config: { trustProxy?: boolean } }) =>
      input.config.trustProxy
        ? {
            status: 200,
            body: {
              isVerified: true,
              status: "verified",
              verificationId: "vrf_test123",
            },
            cookies: {
              clearPendingVerification: true,
              setVerification: {
                assuranceLevel: "SUBSTANTIAL",
                status: "VERIFIED",
                userRef: "user_123",
                verificationId: "vrf_test123",
              },
            },
          }
        : {
            status: 403,
            body: {
              error: "Cross-origin session finalization is not allowed",
              code: "CROSS_ORIGIN_FORBIDDEN",
            },
          }
  ),
  getVerificationFromToken: vi.fn(async () => ({
    assuranceLevel: "NONE",
    status: "PENDING",
    userRef: "user_123",
    verificationId: "vrf_test123",
  })),
  toVerifiedSessionFinalization: vi.fn(() => ({ status: "verified" })),
}));

vi.mock("nitropack/runtime", () => ({
  useRuntimeConfig: () => runtimeConfig.current,
}));

vi.mock("@authbound/server", () => authboundServer);

import sessionHandler from "../runtime/server/api/session";

function createEvent(
  headers: Record<string, string>,
  body: unknown = {
    clientToken: "client_token_123",
    verificationId: "vrf_test123",
  }
) {
  const responseHeaders = new Map<string, string | string[]>();
  return {
    _requestBody: JSON.stringify(body),
    context: {},
    handled: false,
    method: "POST",
    path: "/api/authbound/session",
    node: {
      req: {
        connection: {},
        headers: {
          "content-type": "application/json",
          ...headers,
        },
        method: "POST",
        originalUrl: "/api/authbound/session",
        url: "/api/authbound/session",
      },
      res: {
        appendHeader(name: string, value: string) {
          const key = name.toLowerCase();
          const existing = responseHeaders.get(key);
          responseHeaders.set(
            key,
            existing ? [existing].flat().concat(value) : value
          );
        },
        getHeader(name: string) {
          return responseHeaders.get(name.toLowerCase());
        },
        removeHeader(name: string) {
          responseHeaders.delete(name.toLowerCase());
        },
        setHeader(name: string, value: string | string[]) {
          responseHeaders.set(name.toLowerCase(), value);
        },
      },
    },
  };
}

describe("Nuxt session origin handling", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", vi.fn());
    runtimeConfig.current = {
      authbound: {
        apiKey: `sk_test_${"x".repeat(32)}`,
        cookieName: "__authbound",
        sessionSecret: "session-secret-at-least-32-characters",
      },
      public: {
        authbound: {
          publishableKey: "pk_test_public",
        },
      },
    };
  });

  it("rejects framework-normalized forwarded https URLs unless proxy trust is enabled", async () => {
    const event = createEvent({
      cookie: "__authbound_pending=pending-token",
      host: "app.example.com",
      origin: "https://app.example.com",
      "sec-fetch-site": "same-origin",
      "x-forwarded-proto": "https",
    });

    await expect(sessionHandler(event as never)).rejects.toMatchObject({
      data: { code: "CROSS_ORIGIN_FORBIDDEN" },
      statusCode: 403,
    });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("accepts forwarded https URLs when proxy trust is enabled", async () => {
    runtimeConfig.current.authbound = {
      ...runtimeConfig.current.authbound,
      trustProxy: true,
    };
    const event = createEvent({
      cookie: "__authbound_pending=pending-token",
      host: "internal.example",
      origin: "https://app.example.com",
      "sec-fetch-site": "same-origin",
      "x-forwarded-host": "app.example.com",
      "x-forwarded-proto": "https",
    });

    await expect(sessionHandler(event as never)).resolves.toMatchObject({
      isVerified: true,
      status: "verified",
      verificationId: "vrf_test123",
    });
    expect(authboundServer.AuthboundClient).toHaveBeenCalledWith({
      apiKey: `sk_test_${"x".repeat(32)}`,
      apiUrl: "https://api.authbound.io",
    });
    expect(authboundServer.finalizeSessionHandlerKernel).toHaveBeenCalledWith(
      expect.objectContaining({
        config: expect.objectContaining({ trustProxy: true }),
        pendingVerification: expect.objectContaining({
          verificationId: "vrf_test123",
        }),
      })
    );
    expect(fetch).not.toHaveBeenCalled();
  });
});
