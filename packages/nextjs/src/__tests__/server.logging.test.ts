import type { PolicyId } from "@authbound-sdk/core";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createSessionRoute, createWebhookRoute } from "../server";

describe("Next.js server debug logging", () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("redacts sensitive session request and response fields", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        id: "ver_1234567890abcdef",
        client_token: "client_token_secret_value",
        verification_url: "https://gateway.authbound.io/verify/secret",
        expires_at: "2026-03-09T12:00:00.000Z",
      }),
    }) as typeof fetch;

    const consoleLog = vi.spyOn(console, "log").mockImplementation(() => {});

    const handler = createSessionRoute({
      policyId: "pol_age_over_18_v1" as PolicyId,
      gatewayUrl: "https://gateway.authbound.io",
      secret: "sk_test_secret",
      debug: true,
    });

    const request = new Request(
      "https://playground.authbound.io/api/authbound/session",
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
      "[Authbound] Creating session:",
      {
        policyId: "pol_age_over_18_v1",
        bodyKeys: ["customerUserRef", "metadata", "policyId"],
        hasCustomerUserRef: true,
        metadataKeys: ["playground_user_email"],
      }
    );
    expect(consoleLog).toHaveBeenNthCalledWith(
      2,
      "[Authbound] Session created:",
      {
        sessionId: "ses_...cdef",
        expiresAt: "2026-03-09T12:00:00.000Z",
        hasAuthorizationRequestUrl: true,
        hasClientToken: true,
        hasDeepLink: false,
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
      sessionId: "ver_...cdef",
      status: "verified",
      errorCode: undefined,
    });
  });
});
