import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AuthboundClient } from "./client";

const apiKey = `sk_test_${"x".repeat(32)}`;
const apiUrl = "https://api.example.com";

const policyResponse = {
  object: "policy",
  id: "pol_pension_a1b2c3d4_v1",
  name: "Pension policy",
  description: null,
  purpose: "Check pension eligibility",
  target_type: "credential_definition",
  attestation_type: null,
  credential_definition_id: "pension_credential_v1",
  vct: "urn:vc:authbound:pension:1.0",
  ecosystem: null,
  format: "dc+sd-jwt",
  requested_claims: ["Person.given_name", "Pension.startDate"],
  return_attrs: ["Pension.startDate"],
  status: "active",
  verification_config_id: "00000000-0000-4000-8000-000000000456",
  created_at: "2026-06-15T10:00:00.000Z",
  updated_at: "2026-06-15T10:00:00.000Z",
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

describe("AuthboundClient policies API", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse(policyResponse))
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("creates policies with the v1 REST contract and idempotency header", async () => {
    const fetchMock = vi.fn(async () => jsonResponse(policyResponse, 201));
    vi.stubGlobal("fetch", fetchMock);

    const result = await createClient().policies.create({
      name: "Pension policy",
      purpose: "Check pension eligibility",
      requestedClaims: ["Person.given_name", "Pension.startDate"],
      returnAttrs: ["Pension.startDate"],
      credentialDefinitionId: "pension_credential_v1",
      idempotencyKey: "idem_123",
    });

    expect(result).toMatchObject({
      object: "policy",
      id: "pol_pension_a1b2c3d4_v1",
      credentialDefinitionId: "pension_credential_v1",
      requestedClaims: ["Person.given_name", "Pension.startDate"],
      returnAttrs: ["Pension.startDate"],
      verificationConfigId: "00000000-0000-4000-8000-000000000456",
    });
    const [, request] = fetchMock.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(fetchMock).toHaveBeenCalledWith(
      `${apiUrl}/v1/policies`,
      expect.objectContaining({ method: "POST" })
    );
    expect(request.headers).toMatchObject({
      "Content-Type": "application/json",
      "X-Authbound-Key": apiKey,
      "Idempotency-Key": "idem_123",
    });
    expect(JSON.parse(request.body as string)).toEqual({
      name: "Pension policy",
      purpose: "Check pension eligibility",
      requested_claims: ["Person.given_name", "Pension.startDate"],
      return_attrs: ["Pension.startDate"],
      credential_definition_id: "pension_credential_v1",
    });
  });

  it("lists, gets, and archives policies", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ object: "list", data: [policyResponse] }))
      .mockResolvedValueOnce(jsonResponse(policyResponse))
      .mockResolvedValueOnce(jsonResponse({ ...policyResponse, status: "archived" }));
    vi.stubGlobal("fetch", fetchMock);

    const client = createClient();
    const list = await client.policies.list();
    const policy = await client.policies.get("pol_pension_a1b2c3d4_v1");
    const archived = await client.policies.archive("pol_pension_a1b2c3d4_v1");

    expect(list.data).toHaveLength(1);
    expect(policy.id).toBe("pol_pension_a1b2c3d4_v1");
    expect(archived.status).toBe("archived");
    expect(
      fetchMock.mock.calls.map(([url, init]) => [url, (init as RequestInit).method])
    ).toEqual([
      [`${apiUrl}/v1/policies`, "GET"],
      [`${apiUrl}/v1/policies/pol_pension_a1b2c3d4_v1`, "GET"],
      [`${apiUrl}/v1/policies/pol_pension_a1b2c3d4_v1/archive`, "POST"],
    ]);
  });

  it("requires exactly one policy target before sending create requests", async () => {
    const fetchMock = vi.fn(async () => jsonResponse(policyResponse));
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      createClient().policies.create({
        name: "Ambiguous",
        requestedClaims: ["age_over_18"],
        returnAttrs: ["age_over_18"],
        attestationType: "pid",
        credentialDefinitionId: "pid_v1",
      })
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects non-SD-JWT formats for custom credential policies", async () => {
    const fetchMock = vi.fn(async () => jsonResponse(policyResponse));
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      createClient().policies.create({
        name: "Custom mdoc",
        requestedClaims: ["Document.number"],
        returnAttrs: ["Document.number"],
        vct: "urn:vc:authbound:custom:1.0",
        format: "mso_mdoc",
      })
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
