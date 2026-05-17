import { afterEach, describe, expect, it, vi } from "vitest";
import type { AuthboundConfig } from "../../core/types";
import { createAuthboundApp } from "../handlers";

const config: AuthboundConfig = {
  apiKey: `sk_test_${"x".repeat(32)}`,
  publishableKey: `pk_test_${"x".repeat(32)}`,
  secret: "session-secret-at-least-32-characters",
  apiUrl: "https://api.authbound.test",
  routes: {
    protected: [],
    verify: "/verify",
    callback: "/api/authbound/webhook",
  },
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("Hono Authbound app contract", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("binds session finalization to the pending verification cookie", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({
          object: "verification",
          id: "vrf_test123",
          status: "pending",
          policy_id: "pol_authbound_pension_v1",
          env_mode: "test",
          created_at: "2026-04-21T10:00:00.000Z",
          client_token: "client_token_123",
          verification_url: "https://app.authbound.test/v/vrf_test123",
          client_action: {
            kind: "qr",
            data: "eudi-openid4vp://?client_id=https%3A%2F%2Feudi-verifier.authbound.test&request_uri=https%3A%2F%2Feudi-verifier.authbound.test%2Fwallet%2Frequest.jwt%2Fabc",
            expires_at: "2026-04-21T10:10:00.000Z",
          },
          expires_at: "2026-04-21T10:10:00.000Z",
        })
      )
      .mockResolvedValueOnce(
        jsonResponse({
          verification_id: "vrf_test123",
          status: "verified",
          result_token: "signed_result_token",
        })
      );
    vi.stubGlobal("fetch", fetchMock);

    const app = createAuthboundApp(config);
    const createResponse = await app.request(
      "http://app.example.com/verification",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          policyId: "pol_authbound_pension_v1",
          customerUserRef: "user_123",
        }),
      }
    );
    const pendingCookie = createResponse.headers.get("set-cookie");

    expect(createResponse.status).toBe(200);
    expect(await createResponse.clone().json()).toEqual({
      verificationId: "vrf_test123",
      authorizationRequestUrl:
        "eudi-openid4vp://?client_id=https%3A%2F%2Feudi-verifier.authbound.test&request_uri=https%3A%2F%2Feudi-verifier.authbound.test%2Fwallet%2Frequest.jwt%2Fabc",
      clientToken: "client_token_123",
      expiresAt: "2026-04-21T10:10:00.000Z",
      deepLink:
        "eudi-openid4vp://?client_id=https%3A%2F%2Feudi-verifier.authbound.test&request_uri=https%3A%2F%2Feudi-verifier.authbound.test%2Fwallet%2Frequest.jwt%2Fabc",
    });
    expect(pendingCookie).toContain("__authbound_pending=");

    const sessionResponse = await app.request(
      "http://app.example.com/session",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          cookie: pendingCookie?.split(";")[0] ?? "",
          origin: "http://app.example.com",
          "sec-fetch-site": "same-origin",
        },
        body: JSON.stringify({
          verificationId: "vrf_test123",
          clientToken: "client_token_123",
        }),
      }
    );

    expect(sessionResponse.status).toBe(200);
    expect(await sessionResponse.json()).toEqual({
      isVerified: true,
      verificationId: "vrf_test123",
      status: "verified",
    });
    expect(sessionResponse.headers.get("set-cookie")).toContain("__authbound=");
    expect(sessionResponse.headers.get("set-cookie")).toContain(
      "__authbound_pending=;"
    );
    expect(fetchMock.mock.calls[1]?.[1]).toEqual(
      expect.objectContaining({
        headers: expect.objectContaining({
          "X-Authbound-Key": config.apiKey,
        }),
      })
    );
  });

  it("rejects framework-normalized forwarded https URLs unless proxy trust is enabled", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const app = createAuthboundApp(config);
    const response = await app.request("https://app.example.com/session", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        host: "app.example.com",
        origin: "https://app.example.com",
        "sec-fetch-site": "same-origin",
        "x-forwarded-proto": "https",
      },
      body: JSON.stringify({
        verificationId: "vrf_test123",
        clientToken: "client_token_123",
      }),
    });

    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({
      code: "CROSS_ORIGIN_FORBIDDEN",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("accepts forwarded https URLs when proxy trust is enabled", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({
          object: "verification",
          id: "vrf_test123",
          status: "pending",
          policy_id: "pol_authbound_pension_v1",
          env_mode: "test",
          created_at: "2026-04-21T10:00:00.000Z",
          client_token: "client_token_123",
          client_action: {
            kind: "link",
            data: "openid4vp://authorize?request_uri=https%3A%2F%2Fapi.authbound.test%2Frequest%2F123",
            expires_at: "2026-04-21T10:10:00.000Z",
          },
          expires_at: "2026-04-21T10:10:00.000Z",
        })
      )
      .mockResolvedValueOnce(
        jsonResponse({
          verification_id: "vrf_test123",
          status: "verified",
          result_token: "signed_result_token",
        })
      );
    vi.stubGlobal("fetch", fetchMock);

    const app = createAuthboundApp({ ...config, trustProxy: true });
    const createResponse = await app.request(
      "http://internal.example/verification",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          policyId: "pol_authbound_pension_v1",
          customerUserRef: "user_123",
        }),
      }
    );
    const pendingCookie = createResponse.headers.get("set-cookie");

    const response = await app.request("https://app.example.com/session", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        cookie: pendingCookie?.split(";")[0] ?? "",
        host: "app.example.com",
        origin: "https://app.example.com",
        "sec-fetch-site": "same-origin",
        "x-forwarded-proto": "https",
      },
      body: JSON.stringify({
        verificationId: "vrf_test123",
        clientToken: "client_token_123",
      }),
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      isVerified: true,
      verificationId: "vrf_test123",
    });
    expect(fetchMock.mock.calls[1]?.[1]).toEqual(
      expect.objectContaining({
        headers: expect.objectContaining({
          "X-Authbound-Key": config.apiKey,
        }),
      })
    );
  });
});
