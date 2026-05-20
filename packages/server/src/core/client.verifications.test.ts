import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  AuthboundClient,
  AuthboundClientError,
  createVerification,
  getVerificationStatus,
} from "./client";

const apiKey = `sk_test_${"x".repeat(32)}`;
const publishableKey = `pk_test_${"x".repeat(32)}`;
const apiUrl = "https://api.example.com";
const timestamp = "2026-04-21T10:00:00.000Z";

const verificationReadResponse = {
  object: "verification",
  id: "vrf_123",
  status: "awaiting_user",
  policy_id: "pol_authbound_pension_v1",
  provider: "vcs",
  env_mode: "test",
  created_at: timestamp,
  expires_at: "2026-04-21T10:10:00.000Z",
  client_action: {
    kind: "link",
    data: "openid4vp://authorize?request_uri=https%3A%2F%2Fgateway.example.com%2Frequest",
    expires_at: "2026-04-21T10:10:00.000Z",
  },
  customer_user_ref: "demo-user",
  metadata: { demo: "pension" },
};

const verificationResponse = {
  ...verificationReadResponse,
  client_token: "client_token_123",
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function createClient(): AuthboundClient {
  return new AuthboundClient({ apiKey, apiUrl });
}

describe("AuthboundClient verifications API", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse(verificationResponse))
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("creates a verification with the v1 REST contract and idempotency header", async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse(verificationResponse, 201)
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await createClient().verifications.create({
      policyId: "pol_authbound_pension_v1",
      customerUserRef: "demo-user",
      metadata: { demo: "pension" },
      provider: "vcs",
      idempotencyKey: "idem_123",
    });

    expect(result).toMatchObject({
      object: "verification",
      id: "vrf_123",
      status: "awaiting_user",
      policyId: "pol_authbound_pension_v1",
      envMode: "test",
      customerUserRef: "demo-user",
      clientToken: "client_token_123",
      metadata: { demo: "pension" },
    });
    expect(result.clientAction).toEqual({
      kind: "link",
      data: verificationResponse.client_action.data,
      expiresAt: "2026-04-21T10:10:00.000Z",
    });

    const [, request] = fetchMock.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(fetchMock).toHaveBeenCalledWith(
      `${apiUrl}/v1/verifications`,
      expect.objectContaining({ method: "POST" })
    );
    expect(request.headers).toMatchObject({
      "Content-Type": "application/json",
      "X-Authbound-Key": apiKey,
      "Idempotency-Key": "idem_123",
    });
    expect(JSON.parse(request.body as string)).toEqual({
      policy_id: "pol_authbound_pension_v1",
      customer_user_ref: "demo-user",
      metadata: { demo: "pension" },
      provider: "vcs",
    });
  });

  it("preserves non-JSON API error responses without double-reading the body", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response("verification service unavailable", {
            status: 503,
            statusText: "Service Unavailable",
            headers: { "Content-Type": "text/plain" },
          })
      )
    );

    await expect(
      createClient().verifications.create({
        policyId: "pol_authbound_pension_v1",
      })
    ).rejects.toMatchObject({
      message: "API request failed: 503 Service Unavailable",
      code: "API_ERROR",
      statusCode: 503,
      details: { bodyType: "string" },
    });
  });

  it("rejects create responses without the required client token", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        jsonResponse({
          ...verificationResponse,
          client_token: undefined,
        })
      )
    );

    await expect(
      createClient().verifications.create({
        policyId: "pol_authbound_pension_v1",
      })
    ).rejects.toMatchObject({
      code: "INVALID_RESPONSE",
    });
  });

  it("rejects read responses that leak create-only client tokens", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse(verificationResponse))
    );

    await expect(
      createClient().verifications.get("vrf_123")
    ).rejects.toMatchObject({
      code: "INVALID_RESPONSE",
    });
  });

  it("logs only redacted response metadata when debug logging is enabled", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({
          ...verificationResponse,
          client_token: "client_token_secret",
        })
      )
      .mockResolvedValueOnce(
        jsonResponse({
          verification_id: "vrf_123",
          status: "verified",
          result_token: "result_token_secret",
          assertions: { age_over_18: true },
        })
      );
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    vi.stubGlobal("fetch", fetchMock);

    const client = new AuthboundClient({ apiKey, apiUrl, debug: true });
    await client.verifications.create({
      policyId: "pol_authbound_pension_v1",
    });
    await client.verifications.getResult("vrf_123");

    const logged = JSON.stringify(logSpy.mock.calls);
    expect(logged).toContain("hasClientToken");
    expect(logged).toContain("hasResultToken");
    expect(logged).not.toContain("client_token_secret");
    expect(logged).not.toContain("result_token_secret");
    expect(logged).not.toContain("age_over_18");

    logSpy.mockRestore();
  });

  it("lists, gets, cancels, and fetches signed results with secret-key endpoints", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({
          object: "list",
          data: [verificationReadResponse],
          has_more: true,
        })
      )
      .mockResolvedValueOnce(
        jsonResponse({
          ...verificationReadResponse,
          status: "processing",
        })
      )
      .mockResolvedValueOnce(
        jsonResponse({
          ...verificationReadResponse,
          status: "canceled",
        })
      )
      .mockResolvedValueOnce(
        jsonResponse({
          verification_id: "vrf_123",
          status: "verified",
          result_token: "result.jwt",
          assertions: { pension_verified: true },
        })
      );
    vi.stubGlobal("fetch", fetchMock);

    const client = createClient();

    const list = await client.verifications.list({
      status: "awaiting_user",
      limit: 10,
      startingAfter: "vrf_before",
      endingBefore: "vrf_after",
    });
    const verification = await client.verifications.get("vrf_123");
    const canceled = await client.verifications.cancel("vrf_123", {
      idempotencyKey: "cancel_123",
    });
    const result = await client.verifications.getResult("vrf_123");

    expect(list.data[0]?.id).toBe("vrf_123");
    expect(list.hasMore).toBe(true);
    expect(verification.status).toBe("processing");
    expect(canceled.status).toBe("canceled");
    expect(result).toEqual({
      verificationId: "vrf_123",
      status: "verified",
      resultToken: "result.jwt",
      assertions: { pension_verified: true },
    });
    expect(
      fetchMock.mock.calls.map(([url, init]) => [
        url,
        (init as RequestInit).method,
      ])
    ).toEqual([
      [
        `${apiUrl}/v1/verifications?status=awaiting_user&limit=10&starting_after=vrf_before&ending_before=vrf_after`,
        "GET",
      ],
      [`${apiUrl}/v1/verifications/vrf_123`, "GET"],
      [`${apiUrl}/v1/verifications/vrf_123/cancel`, "POST"],
      [`${apiUrl}/v1/verifications/vrf_123/result`, "GET"],
    ]);
    expect((fetchMock.mock.calls[2]?.[1] as RequestInit).headers).toMatchObject(
      {
        "Idempotency-Key": "cancel_123",
      }
    );
  });

  it("normalizes nullable verification fields from the gateway", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        jsonResponse({
          ...verificationReadResponse,
          policy_hash: null,
          terminal_at: null,
          failure_code: null,
          client_action: null,
          customer_user_ref: null,
          metadata: null,
        })
      )
    );

    const verification = await createClient().verifications.get("vrf_123");

    expect(verification).toMatchObject({
      object: "verification",
      id: "vrf_123",
      status: "awaiting_user",
    });
    expect(verification.policyHash).toBeUndefined();
    expect(verification.terminalAt).toBeUndefined();
    expect(verification.failureCode).toBeUndefined();
    expect(verification.clientAction).toBeUndefined();
    expect(verification.customerUserRef).toBeUndefined();
    expect(verification.metadata).toBeUndefined();
  });

  it("preserves precise public verification progress statuses from the API", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        jsonResponse({
          ...verificationReadResponse,
          status: "awaiting_user",
        })
      )
    );

    const verification = await createClient().verifications.get("vrf_123");

    expect(verification.status).toBe("awaiting_user");
  });

  it("rejects stale provider preferences before sending create requests", async () => {
    const fetchMock = vi.fn(async () => jsonResponse(verificationResponse));
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      createClient().verifications.create({
        policyId: "pol_authbound_pension_v1",
        provider: "reverify" as never,
      })
    ).rejects.toMatchObject({
      code: "VALIDATION_ERROR",
      statusCode: 400,
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("gets client-token status with publishable-key scoped headers", async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({
        object: "verification_status",
        id: "vrf_123",
        status: "verified",
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    const status = await createClient().verifications.getStatus("vrf_123", {
      clientToken: "client_token_123",
      publishableKey,
      origin: "https://app.example.com/path?ignored=true",
    });

    expect(status).toEqual({
      object: "verification_status",
      id: "vrf_123",
      status: "verified",
    });
    expect(fetchMock).toHaveBeenCalledWith(
      `${apiUrl}/v1/verifications/vrf_123/status`,
      expect.objectContaining({ method: "GET" })
    );
    const [, request] = fetchMock.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(request.headers).toMatchObject({
      Authorization: "Bearer client_token_123",
      Origin: "https://app.example.com",
      "X-Authbound-Publishable-Key": publishableKey,
    });
    expect(request.headers).not.toHaveProperty("X-Authbound-Key");
  });

  it("provides standalone verification helpers without session naming", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(verificationResponse))
      .mockResolvedValueOnce(
        jsonResponse({
          object: "verification_status",
          id: "vrf_123",
          status: "awaiting_user",
        })
      );
    vi.stubGlobal("fetch", fetchMock);

    await createVerification({
      apiKey,
      apiUrl,
      policyId: "pol_authbound_pension_v1",
    });
    await getVerificationStatus({
      apiUrl,
      verificationId: "vrf_123",
      clientToken: "client_token_123",
      publishableKey,
    });

    expect(fetchMock.mock.calls[0]?.[0]).toBe(`${apiUrl}/v1/verifications`);
    expect(fetchMock.mock.calls[1]?.[0]).toBe(
      `${apiUrl}/v1/verifications/vrf_123/status`
    );
  });

  it("preserves non-JSON errors from the standalone status helper", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response("verification status unavailable", {
            status: 503,
            statusText: "Service Unavailable",
            headers: { "Content-Type": "text/plain" },
          })
      )
    );

    await expect(
      getVerificationStatus({
        apiUrl,
        verificationId: "vrf_123",
        clientToken: "client_token_123",
        publishableKey,
      })
    ).rejects.toMatchObject({
      message: "API request failed: 503 Service Unavailable",
      code: "API_ERROR",
      statusCode: 503,
      details: { bodyType: "string" },
    });
  });

  it("preserves public API error codes", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        jsonResponse(
          {
            object: "error",
            code: "invalid_policy",
            message: "Policy not found",
          },
          400
        )
      )
    );

    await expect(
      createClient().verifications.create({
        policyId: "pol_missing",
      })
    ).rejects.toMatchObject({
      name: "AuthboundClientError",
      code: "invalid_policy",
      statusCode: 400,
    });
  });

  it("redacts sensitive fields from API error details", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        jsonResponse(
          {
            object: "error",
            code: "bad_request",
            message: "Bad request",
            client_token: "client_token_secret",
            result_token: "result_token_secret",
            assertions: { age_over_18: true },
            secret: "whsec_secret",
          },
          400
        )
      )
    );

    let thrown: unknown;
    try {
      await createClient().verifications.create({
        policyId: "pol_authbound_pension_v1",
      });
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(AuthboundClientError);
    expect(thrown).toMatchObject({
      code: "bad_request",
      details: {
        code: "bad_request",
        hasClientToken: true,
        hasResultToken: true,
        hasWebhookSecret: true,
        object: "error",
      },
      message: "Bad request",
      statusCode: 400,
    });
    const serialized = JSON.stringify((thrown as AuthboundClientError).details);
    expect(serialized).not.toContain("client_token_secret");
    expect(serialized).not.toContain("result_token_secret");
    expect(serialized).not.toContain("age_over_18");
    expect(serialized).not.toContain("whsec_secret");
  });
});
