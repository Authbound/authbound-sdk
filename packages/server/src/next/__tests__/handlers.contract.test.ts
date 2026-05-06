import crypto from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AuthboundConfig } from "../../core/types";
import { createAuthboundHandlers } from "../handlers";

const apiKey = `sk_test_${"x".repeat(32)}`;
const publishableKey = `pk_test_${"x".repeat(32)}`;
const secret = "session-secret-at-least-32-characters";

const config: AuthboundConfig = {
  apiKey,
  publishableKey,
  secret,
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

function signWebhook(payload: string, webhookSecret: string): string {
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = crypto
    .createHmac("sha256", webhookSecret)
    .update(`${timestamp}.${payload}`)
    .digest("hex");
  return `t=${timestamp},v1=${signature}`;
}

describe("createAuthboundHandlers browser verification contract", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("accepts camelCase create requests and returns the canonical browser response", async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({
        object: "verification",
        id: "vrf_test123",
        status: "pending",
        client_token: "client_token_123",
        client_action: {
          kind: "link",
          data: "openid4vp://authorize?request_uri=https%3A%2F%2Fapi.authbound.test%2Frequest%2F123",
          expires_at: "2026-04-21T10:10:00.000Z",
        },
        expires_at: "2026-04-21T10:10:00.000Z",
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    const { POST } = createAuthboundHandlers(config);
    const response = await POST(
      new Request("https://app.example.com/api/authbound/verification", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          policyId: "pol_authbound_pension_v1",
          customerUserRef: "user_123",
          metadata: { flow: "age_gate" },
          provider: "vcs",
        }),
      })
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      verificationId: "vrf_test123",
      authorizationRequestUrl:
        "openid4vp://authorize?request_uri=https%3A%2F%2Fapi.authbound.test%2Frequest%2F123",
      clientToken: "client_token_123",
      expiresAt: "2026-04-21T10:10:00.000Z",
      deepLink:
        "openid4vp://authorize?request_uri=https%3A%2F%2Fapi.authbound.test%2Frequest%2F123",
    });
    expect(response.headers.get("set-cookie")).toContain(
      "__authbound_pending="
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.authbound.test/v1/verifications",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          policy_id: "pol_authbound_pension_v1",
          customer_user_ref: "user_123",
          metadata: { flow: "age_gate" },
          provider: "vcs",
        }),
      })
    );
  });

  it("finalizes a verified browser session and sets the session cookie", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({
          object: "verification",
          id: "vrf_test123",
          status: "pending",
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
          object: "verification_status",
          id: "vrf_test123",
          status: "verified",
          result: {
            verified: true,
            attributes: { birth_date: "1990-05-15" },
          },
        })
      );
    vi.stubGlobal("fetch", fetchMock);

    const { POST } = createAuthboundHandlers(config);
    const createResponse = await POST(
      new Request("https://app.example.com/api/authbound/verification", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          policyId: "pol_authbound_pension_v1",
          customerUserRef: "user_123",
        }),
      })
    );
    const pendingCookie = createResponse.headers.get("set-cookie");

    expect(pendingCookie).toContain("__authbound_pending=");

    const response = await POST(
      new Request("https://app.example.com/api/authbound/session", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          cookie: pendingCookie?.split(";")[0] ?? "",
          origin: "https://app.example.com",
          "sec-fetch-site": "same-origin",
        },
        body: JSON.stringify({
          verificationId: "vrf_test123",
          clientToken: "client_token_123",
        }),
      })
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      isVerified: true,
      verificationId: "vrf_test123",
      status: "verified",
    });
    expect(response.headers.get("set-cookie")).toContain("__authbound=");
    expect(response.headers.get("set-cookie")).toContain(
      "__authbound_pending=;"
    );
    expect(fetchMock.mock.calls[1]?.[1]).toEqual(
      expect.objectContaining({
        headers: expect.objectContaining({
          Origin: "https://app.example.com",
        }),
      })
    );
  });

  it("rejects session finalization without the pending verification cookie", async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({
        object: "verification_status",
        id: "vrf_test123",
        status: "verified",
        result: { verified: true },
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    const { POST } = createAuthboundHandlers(config);
    const response = await POST(
      new Request("https://app.example.com/api/authbound/session", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          origin: "https://app.example.com",
          "sec-fetch-site": "same-origin",
        },
        body: JSON.stringify({
          verificationId: "vrf_test123",
          clientToken: "client_token_123",
        }),
      })
    );

    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({
      code: "VERIFICATION_BINDING_REQUIRED",
    });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(response.headers.get("set-cookie")).toBeNull();
  });

  it("rejects cross-origin session finalization before checking gateway status", async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({
        object: "verification_status",
        id: "vrf_test123",
        status: "verified",
        result: { verified: true },
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    const { POST } = createAuthboundHandlers(config);
    const response = await POST(
      new Request("https://app.example.com/api/authbound/session", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          origin: "https://attacker.example",
          "sec-fetch-site": "cross-site",
        },
        body: JSON.stringify({
          verificationId: "vrf_test123",
          clientToken: "client_token_123",
        }),
      })
    );

    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({
      code: "CROSS_ORIGIN_FORBIDDEN",
    });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(response.headers.get("set-cookie")).toBeNull();
  });

  it("rejects session finalization when status is not verified", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({
          object: "verification",
          id: "vrf_test123",
          status: "pending",
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
          object: "verification_status",
          id: "vrf_test123",
          status: "processing",
        })
      );
    vi.stubGlobal("fetch", fetchMock);

    const { POST } = createAuthboundHandlers(config);
    const createResponse = await POST(
      new Request("https://app.example.com/api/authbound/verification", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          policyId: "pol_authbound_pension_v1",
          customerUserRef: "user_123",
        }),
      })
    );
    const pendingCookie = createResponse.headers.get("set-cookie");

    const response = await POST(
      new Request("https://app.example.com/api/authbound/session", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          cookie: pendingCookie?.split(";")[0] ?? "",
          origin: "https://app.example.com",
          "sec-fetch-site": "same-origin",
        },
        body: JSON.stringify({
          verificationId: "vrf_test123",
          clientToken: "client_token_123",
        }),
      })
    );

    expect(response.status).toBe(409);
    expect(response.headers.get("set-cookie")).toBeNull();
  });

  it("fails closed when webhook secret verification is not configured", async () => {
    const { POST } = createAuthboundHandlers(config);

    const response = await POST(
      new Request("https://app.example.com/api/authbound/webhook", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: "evt_123", object: "event" }),
      })
    );

    expect(response.status).toBe(500);
    expect(await response.json()).toMatchObject({
      code: "WEBHOOK_SECRET_MISSING",
    });
    expect(response.headers.get("set-cookie")).toBeNull();
  });

  it("processes signed webhooks without setting browser cookies", async () => {
    const webhookSecret = "whsec_test_secret";
    const payload = JSON.stringify({
      id: "evt_123",
      object: "event",
      api_version: "2026-04-01",
      created: Math.floor(Date.now() / 1000),
      livemode: false,
      type: "identity.verification_session.verified",
      data: {
        object: {
          id: "vrf_test123",
          object: "identity.verification_session",
          created: Math.floor(Date.now() / 1000),
          livemode: false,
          type: "id_number",
          status: "verified",
          client_reference_id: "user_123",
        },
      },
    });
    const onWebhook = vi.fn();
    const { POST } = createAuthboundHandlers(
      {
        ...config,
        webhookSecret,
      },
      { onWebhook }
    );

    const response = await POST(
      new Request("https://app.example.com/api/authbound/webhook", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-authbound-signature": signWebhook(payload, webhookSecret),
        },
        body: payload,
      })
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ received: true });
    expect(onWebhook).toHaveBeenCalledTimes(1);
    expect(response.headers.get("set-cookie")).toBeNull();
  });
});
