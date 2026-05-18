import { beforeEach, describe, expect, it, vi } from "vitest";

const runtimeConfig = vi.hoisted(() => ({
  current: {
    authbound: {},
    public: { authbound: {} },
  },
}));

const authboundServer = vi.hoisted(() => ({
  AuthboundClient: vi.fn(function AuthboundClient() {
    return { verifications: { create: vi.fn() } };
  }),
  createToken: vi.fn(async () => "pending-session-token"),
  createVerificationHandlerKernel: vi.fn(async () => ({
    status: 200,
    body: {
      authorizationRequestUrl: "openid4vp://authorize?request_uri=123",
      clientToken: "client_token_123",
      expiresAt: "2026-04-21T10:10:00.000Z",
      verificationId: "vrf_test123",
    },
    cookies: {
      setPendingVerification: {
        userRef: "user_123",
        verificationId: "vrf_test123",
      },
    },
  })),
}));

vi.mock("nitropack/runtime", () => ({
  useRuntimeConfig: () => runtimeConfig.current,
}));

vi.mock("@authbound/server", () => authboundServer);

import verificationHandler from "../runtime/server/api/verification";

function createEvent(headers: Record<string, string>, body: unknown) {
  const responseHeaders = new Map<string, string | string[]>();
  return {
    _requestBody: JSON.stringify(body),
    context: {},
    handled: false,
    method: "POST",
    path: "/api/authbound/verification",
    node: {
      req: {
        connection: {},
        headers: {
          "content-type": "application/json",
          ...headers,
        },
        method: "POST",
        originalUrl: "/api/authbound/verification",
        url: "/api/authbound/verification",
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

describe("Nuxt verification route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    runtimeConfig.current = {
      authbound: {
        apiKey: `sk_test_${"x".repeat(32)}`,
        cookieName: "__authbound",
        policyId: "pol_age_over_18_authbound_v1",
        sessionSecret: "session-secret-at-least-32-characters",
      },
      public: {
        authbound: {
          debug: false,
          sessionMode: "sdk",
        },
      },
    };
  });

  it("delegates create behavior to the server handler kernel and applies pending-cookie effects", async () => {
    const event = createEvent(
      { "idempotency-key": "idem_123" },
      {
        customerUserRef: "user_123",
        metadata: { flow: "age_gate" },
        provider: "vcs",
      }
    );

    await expect(verificationHandler(event as never)).resolves.toEqual({
      authorizationRequestUrl: "openid4vp://authorize?request_uri=123",
      clientToken: "client_token_123",
      expiresAt: "2026-04-21T10:10:00.000Z",
      verificationId: "vrf_test123",
    });
    expect(authboundServer.AuthboundClient).toHaveBeenCalledWith({
      apiKey: `sk_test_${"x".repeat(32)}`,
      apiUrl: "https://api.authbound.io",
      debug: false,
    });
    expect(
      authboundServer.createVerificationHandlerKernel
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        idempotencyKey: "idem_123",
        requestBody: {
          customerUserRef: "user_123",
          metadata: { flow: "age_gate" },
          policyId: "pol_age_over_18_authbound_v1",
          provider: "vcs",
        },
      })
    );
    expect(authboundServer.createToken).toHaveBeenCalledWith(
      expect.objectContaining({
        assuranceLevel: "NONE",
        status: "PENDING",
        userRef: "user_123",
        verificationId: "vrf_test123",
      })
    );
    expect(event.node.res.getHeader("set-cookie")).toContain(
      "__authbound_pending="
    );
  });
});
