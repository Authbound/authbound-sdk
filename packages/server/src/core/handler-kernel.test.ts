import { describe, expect, it, vi } from "vitest";
import { AuthboundClientError } from "./client";
import {
  createVerificationHandlerKernel,
  finalizeSessionHandlerKernel,
  processWebhookHandlerKernel,
} from "./handler-kernel";
import type {
  AuthboundConfig,
  AuthboundVerificationContext,
  WebhookEvent,
} from "./types";
import { generateWebhookSignature } from "./webhooks";

const config: AuthboundConfig = {
  apiKey: `sk_test_${"x".repeat(32)}`,
  publishableKey: `pk_test_${"x".repeat(32)}`,
  secret: "session-secret-at-least-32-characters",
  apiUrl: "https://api.authbound.test",
  webhookSecret: "whsec_test_secret",
  routes: {
    protected: [],
    verify: "/verify",
    callback: "/api/authbound/webhook",
  },
};

describe("framework handler kernel", () => {
  it("creates a browser verification and returns the pending-cookie effect", async () => {
    const onVerificationCreated = vi.fn();
    const client = {
      verifications: {
        create: vi.fn(async () => ({
          id: "vrf_test123",
          clientToken: "client_token_123",
          verificationUrl: "https://app.authbound.test/v/vrf_test123",
          clientAction: {
            kind: "qr",
            data: "openid4vp://authorize?request_uri=https%3A%2F%2Fapi.authbound.test%2Frequest%2F123",
            expiresAt: "2026-04-21T10:10:00.000Z",
          },
          expiresAt: "2026-04-21T10:10:00.000Z",
        })),
      },
    };

    const result = await createVerificationHandlerKernel({
      requestBody: {
        policyId: "pol_authbound_pension_v1",
        customerUserRef: "user_123",
        metadata: { flow: "age_gate" },
        provider: "vcs",
      },
      config,
      client,
      idempotencyKey: "idem_123",
      onVerificationCreated,
    });

    expect(result).toMatchObject({
      status: 200,
      body: {
        verificationId: "vrf_test123",
        authorizationRequestUrl:
          "openid4vp://authorize?request_uri=https%3A%2F%2Fapi.authbound.test%2Frequest%2F123",
        clientToken: "client_token_123",
        expiresAt: "2026-04-21T10:10:00.000Z",
      },
      cookies: {
        setPendingVerification: {
          userRef: "user_123",
          verificationId: "vrf_test123",
        },
      },
    });
    expect(client.verifications.create).toHaveBeenCalledWith({
      policyId: "pol_authbound_pension_v1",
      customerUserRef: "user_123",
      metadata: { flow: "age_gate" },
      provider: "vcs",
      idempotencyKey: "idem_123",
    });
    expect(onVerificationCreated).toHaveBeenCalledWith(result.body);
  });

  it("accepts arbitrary JSON metadata in framework create requests", async () => {
    const client = {
      verifications: {
        create: vi.fn(async () => ({
          id: "vrf_test123",
          clientToken: "client_token_123",
          verificationUrl: "https://app.authbound.test/v/vrf_test123",
          clientAction: {
            kind: "link" as const,
            data: "openid4vp://authorize?request_uri=https%3A%2F%2Fapi.authbound.test%2Frequest%2F123",
            expiresAt: "2026-04-21T10:10:00.000Z",
          },
          expiresAt: "2026-04-21T10:10:00.000Z",
        })),
      },
    };

    const metadata = {
      cart_total: 42,
      checks: ["age", "identity"],
      nested: { tier: "gold" },
    };

    const result = await createVerificationHandlerKernel({
      requestBody: {
        policyId: "pol_authbound_pension_v1",
        metadata,
      },
      config,
      client,
    });

    expect(result.status).toBe(200);
    expect(client.verifications.create).toHaveBeenCalledWith(
      expect.objectContaining({ metadata })
    );
  });

  it("maps upstream client errors without leaking generic exceptions", async () => {
    const client = {
      verifications: {
        create: vi.fn(async () => {
          throw new AuthboundClientError("Policy not found", "not_found", 404);
        }),
      },
    };

    const result = await createVerificationHandlerKernel({
      requestBody: { policyId: "pol_authbound_pension_v1" },
      config,
      client,
    });

    expect(result).toEqual({
      status: 404,
      body: {
        error: "Policy not found",
        code: "not_found",
      },
    });
  });

  it("finalizes only a same-origin pending browser verification", async () => {
    const pendingVerification: AuthboundVerificationContext = {
      isVerified: false,
      status: "PENDING",
      assuranceLevel: "NONE",
      verificationId: "vrf_test123",
      userRef: "user_123",
      expiresAt: new Date(Date.now() + 60_000),
    };
    const client = {
      verifications: {
        getResult: vi.fn(async () => ({
          verificationId: "vrf_test123",
          status: "verified" as const,
          resultToken: "signed_result_token",
          assertions: { birth_date: "1990-05-15" },
        })),
      },
    };

    const result = await finalizeSessionHandlerKernel({
      request: {
        url: "https://app.example.com/api/authbound/session",
        headers: {
          get: (name) =>
            name.toLowerCase() === "origin"
              ? "https://app.example.com"
              : name.toLowerCase() === "sec-fetch-site"
                ? "same-origin"
                : null,
        },
      },
      requestBody: {
        verificationId: "vrf_test123",
        clientToken: "client_token_123",
      },
      pendingVerification,
      config,
      client,
    });

    expect(result).toMatchObject({
      status: 200,
      body: {
        isVerified: true,
        verificationId: "vrf_test123",
        status: "verified",
      },
      cookies: {
        clearPendingVerification: true,
        setVerification: {
          userRef: "user_123",
          verificationId: "vrf_test123",
          status: "VERIFIED",
          assuranceLevel: "SUBSTANTIAL",
        },
      },
    });
    expect(client.verifications.getResult).toHaveBeenCalledWith("vrf_test123");
  });

  it("processes signed webhooks and invokes terminal callbacks consistently", async () => {
    const event: WebhookEvent = {
      id: "evt_123",
      object: "event",
      api_version: "2026-04-01",
      created: Math.floor(Date.now() / 1000),
      livemode: false,
      type: "verification.completed",
      data: {
        object: {
          id: "vrf_test123",
          object: "verification",
          status: "verified",
        },
      },
    };
    const rawBody = JSON.stringify(event);
    const { signature } = generateWebhookSignature({
      payload: rawBody,
      secret: config.webhookSecret ?? "",
    });
    const onWebhook = vi.fn();
    const onVerified = vi.fn();
    const onFailed = vi.fn();

    const result = await processWebhookHandlerKernel({
      rawBody,
      signature,
      config,
      onWebhook,
      onVerified,
      onFailed,
    });

    expect(result).toEqual({
      status: 200,
      body: { received: true },
    });
    expect(onWebhook).toHaveBeenCalledWith(event);
    expect(onVerified).toHaveBeenCalledWith(event);
    expect(onFailed).not.toHaveBeenCalled();
  });

  it("accepts parsed webhook bodies only when signature verification is explicitly skipped", async () => {
    const event: WebhookEvent = {
      id: "evt_123",
      object: "event",
      api_version: "2026-04-01",
      created: Math.floor(Date.now() / 1000),
      livemode: false,
      type: "verification.completed",
      data: {
        object: {
          id: "vrf_test123",
          object: "verification",
          status: "verified",
        },
      },
    };
    const onWebhook = vi.fn();

    const skippedResult = await processWebhookHandlerKernel({
      rawBody: null,
      parsedBody: event,
      config: {
        ...config,
        webhookSecret: undefined,
        unsafeSkipWebhookSignatureVerification: true,
      },
      onWebhook,
    });

    expect(skippedResult).toEqual({
      status: 200,
      body: { received: true },
    });
    expect(onWebhook).toHaveBeenCalledWith(event);

    const signedResult = await processWebhookHandlerKernel({
      rawBody: null,
      parsedBody: event,
      config,
    });

    expect(signedResult).toEqual({
      status: 400,
      body: {
        error: "Raw request body is required for webhook verification",
        code: "RAW_BODY_REQUIRED",
      },
    });
  });
});
