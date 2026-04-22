import type { PolicyId } from "@authbound-sdk/core";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createStatusRoute,
  createVerificationRoute,
  createWebhookRoute,
} from "../server";

describe("Next.js server debug logging", () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("redacts sensitive verification request and response fields", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        object: "verification",
        id: "vrf_1234567890abcdef",
        client_token: "client_token_secret_value",
        client_action: {
          kind: "link",
          data: "https://gateway.authbound.io/verify/secret",
          expires_at: "2026-03-09T12:00:00.000Z",
        },
        expires_at: "2026-03-09T12:00:00.000Z",
      }),
    }) as typeof fetch;

    const consoleLog = vi.spyOn(console, "log").mockImplementation(() => {});

    const handler = createVerificationRoute({
      policyId: "pol_age_over_18_v1" as PolicyId,
      gatewayUrl: "https://gateway.authbound.io",
      secret: "sk_test_secret",
      debug: true,
    });

    const request = new Request(
      "https://playground.authbound.io/api/authbound/verification",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          customerUserRef: "user_12345",
          metadata: {
            playground_user_email: "lassi@example.com",
          },
        }),
      }
    );

    await handler(request as never);

    expect(consoleLog).toHaveBeenCalledTimes(2);
    expect(consoleLog).toHaveBeenNthCalledWith(
      1,
      "[Authbound] Creating verification:",
      {
        policyId: "pol_age_over_18_v1",
        bodyKeys: ["customerUserRef", "metadata", "policyId"],
        hasCustomerUserRef: true,
        metadataKeys: ["playground_user_email"],
      }
    );
    expect(consoleLog).toHaveBeenNthCalledWith(
      2,
      "[Authbound] Verification created:",
      {
        verificationId: "vrf_...cdef",
        expiresAt: "2026-03-09T12:00:00.000Z",
        hasAuthorizationRequestUrl: true,
        hasClientToken: true,
        hasDeepLink: true,
      }
    );
  });

  it("maps Gateway verification responses without legacy ses_ prefixes", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        object: "verification",
        id: "00000000-0000-4000-8000-000000000123",
        policy_id: "pol_authbound_pension_v1",
        status: "pending",
        client_token: "client_token_secret_value",
        client_action: {
          kind: "link",
          data: "openid4vp://authorize?request_uri=https%3A%2F%2Fgateway.example.com",
          expires_at: "2026-03-09T12:00:00.000Z",
        },
        expires_at: "2026-03-09T12:00:00.000Z",
      }),
    }) as typeof fetch;

    const handler = createVerificationRoute({
      policyId: "pol_authbound_pension_v1" as PolicyId,
      gatewayUrl: "https://gateway.authbound.io",
      secret: "sk_test_secret",
    });

    const response = await handler(
      new Request(
        "https://playground.authbound.io/api/authbound/verification",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ customerUserRef: "demo-user" }),
        }
      ) as never
    );

    expect(await response.json()).toEqual({
      verificationId: "00000000-0000-4000-8000-000000000123",
      authorizationRequestUrl:
        "openid4vp://authorize?request_uri=https%3A%2F%2Fgateway.example.com",
      clientToken: "client_token_secret_value",
      expiresAt: "2026-03-09T12:00:00.000Z",
      deepLink:
        "openid4vp://authorize?request_uri=https%3A%2F%2Fgateway.example.com",
    });
    expect(global.fetch).toHaveBeenCalledWith(
      "https://gateway.authbound.io/v1/verifications",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          customer_user_ref: "demo-user",
          policy_id: "pol_authbound_pension_v1",
        }),
      })
    );
  });

  it("does not let browser request bodies override the route policy", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        object: "verification",
        id: "vrf_123",
        client_token: "client_token_secret_value",
        client_action: {
          kind: "link",
          data: "openid4vp://authorize?request_uri=https%3A%2F%2Fgateway.example.com",
          expires_at: "2026-03-09T12:00:00.000Z",
        },
        expires_at: "2026-03-09T12:00:00.000Z",
      }),
    }) as typeof fetch;

    const handler = createVerificationRoute({
      policyId: "pol_authbound_pension_v1" as PolicyId,
      gatewayUrl: "https://gateway.authbound.io",
      secret: "sk_test_secret",
    });

    await handler(
      new Request(
        "https://playground.authbound.io/api/authbound/verification",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ policyId: "pol_other_policy_v1" }),
        }
      ) as never
    );

    expect(global.fetch).toHaveBeenCalledWith(
      "https://gateway.authbound.io/v1/verifications",
      expect.objectContaining({
        body: JSON.stringify({
          policy_id: "pol_authbound_pension_v1",
        }),
      })
    );
  });

  it("forwards idempotency headers when proxying verification creates", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        object: "verification",
        id: "vrf_123",
        client_token: "client_token_secret_value",
        client_action: {
          kind: "link",
          data: "openid4vp://authorize?request_uri=https%3A%2F%2Fgateway.example.com",
          expires_at: "2026-03-09T12:00:00.000Z",
        },
        expires_at: "2026-03-09T12:00:00.000Z",
      }),
    }) as typeof fetch;

    const handler = createVerificationRoute({
      policyId: "pol_authbound_pension_v1" as PolicyId,
      gatewayUrl: "https://gateway.authbound.io",
      secret: "sk_test_secret",
    });

    await handler(
      new Request("https://playground.authbound.io/api/authbound/verification", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "Idempotency-Key": "idem_123",
        },
        body: JSON.stringify({}),
      }) as never
    );

    expect(global.fetch).toHaveBeenCalledWith(
      "https://gateway.authbound.io/v1/verifications",
      expect.objectContaining({
        headers: expect.objectContaining({
          "Idempotency-Key": "idem_123",
        }),
      })
    );
  });

  it("uses the configured publishable key when proxying status requests", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        object: "verification_status",
        id: "vrf_123",
        status: "processing",
      }),
    }) as typeof fetch;

    const handler = createStatusRoute({
      gatewayUrl: "https://gateway.authbound.io",
      publishableKey: "pk_test_configured",
    });

    await handler(
      new Request(
        "https://playground.authbound.io/api/authbound/status/vrf_123",
        {
          headers: {
            Authorization: "Bearer client_token_123",
            "X-Authbound-Publishable-Key": "pk_test_browser_supplied",
          },
        }
      ) as never,
      { params: Promise.resolve({ verificationId: "vrf_123" }) }
    );

    expect(global.fetch).toHaveBeenCalledWith(
      "https://gateway.authbound.io/v1/verifications/vrf_123/status",
      {
        headers: {
          Authorization: "Bearer client_token_123",
          "X-Authbound-Publishable-Key": "pk_test_configured",
        },
      }
    );
  });

  it("logs only webhook metadata when debug logging is enabled", async () => {
    const eventPayload = JSON.stringify({
      id: "evt_1234567890abcdef",
      type: "identity.verification_session.verified",
      created: 1_741_510_400,
      data: {
        object: {
          id: "ver_1234567890abcdef",
          status: "verified",
          verified_outputs: {
            age_over_18: true,
          },
        },
      },
    });

    const { generateWebhookSignature } = await import("../server");
    const { signature } = generateWebhookSignature({
      payload: eventPayload,
      secret: "whsec_test_secret",
    });

    const consoleLog = vi.spyOn(console, "log").mockImplementation(() => {});

    const handler = createWebhookRoute({
      webhookSecret: "whsec_test_secret",
      debug: true,
    });

    const request = new Request(
      "https://playground.authbound.io/api/authbound/webhook",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-authbound-signature": signature,
        },
        body: eventPayload,
      }
    );

    await handler(request as never);

    expect(consoleLog).toHaveBeenCalledWith("[Authbound] Webhook event:", {
      eventId: "evt_...cdef",
      type: "identity.verification_session.verified",
      created: 1_741_510_400,
      verificationId: "ver_...cdef",
      status: "verified",
      errorCode: undefined,
    });
  });
});
