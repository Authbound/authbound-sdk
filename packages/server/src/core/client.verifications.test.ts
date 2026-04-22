import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AuthboundClient, createVerification, getVerificationStatus } from "./client";

const apiKey = `sk_test_${"x".repeat(32)}`;
const publishableKey = `pk_test_${"x".repeat(32)}`;
const apiUrl = "https://api.example.com";
const timestamp = "2026-04-21T10:00:00.000Z";

const verificationResponse = {
  object: "verification",
  id: "vrf_123",
  status: "pending",
  policy_id: "pol_authbound_pension_v1",
  provider: "vcs",
  env_mode: "test",
  created_at: timestamp,
  expires_at: "2026-04-21T10:10:00.000Z",
  client_token: "client_token_123",
  client_action: {
    kind: "link",
    data: "openid4vp://authorize?request_uri=https%3A%2F%2Fgateway.example.com%2Frequest",
    expires_at: "2026-04-21T10:10:00.000Z",
  },
  customer_user_ref: "demo-user",
  metadata: { demo: "pension" },
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
    const fetchMock = vi.fn(async () => jsonResponse(verificationResponse, 201));
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
      status: "pending",
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

  it("lists, gets, cancels, and fetches signed results with secret-key endpoints", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ object: "list", data: [verificationResponse], has_more: true }))
      .mockResolvedValueOnce(jsonResponse({ ...verificationResponse, status: "processing" }))
      .mockResolvedValueOnce(jsonResponse({ ...verificationResponse, status: "canceled" }))
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
      status: "pending",
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
        `${apiUrl}/v1/verifications?status=pending&limit=10&starting_after=vrf_before&ending_before=vrf_after`,
        "GET",
      ],
      [`${apiUrl}/v1/verifications/vrf_123`, "GET"],
      [`${apiUrl}/v1/verifications/vrf_123/cancel`, "POST"],
      [`${apiUrl}/v1/verifications/vrf_123/result`, "GET"],
    ]);
    expect((fetchMock.mock.calls[2]?.[1] as RequestInit).headers).toMatchObject({
      "Idempotency-Key": "cancel_123",
    });
  });

  it("gets client-token status with publishable-key scoped headers", async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({
        object: "verification_status",
        id: "vrf_123",
        status: "verified",
        result: {
          verified: true,
          attributes: { "Pension.startDate": "2025-01-01" },
          assertions: { "Pension.startDate": "2025-01-01" },
        },
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    const status = await createClient().verifications.getStatus("vrf_123", {
      clientToken: "client_token_123",
      publishableKey,
    });

    expect(status).toEqual({
      object: "verification_status",
      id: "vrf_123",
      status: "verified",
      result: {
        verified: true,
        attributes: { "Pension.startDate": "2025-01-01" },
        assertions: { "Pension.startDate": "2025-01-01" },
      },
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
          status: "pending",
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
});
