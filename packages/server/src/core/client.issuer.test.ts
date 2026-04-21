import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AuthboundClient } from "./client";

const apiKey = `sk_test_${"x".repeat(32)}`;
const apiUrl = "https://api.example.com";
const timestamp = "2026-04-20T10:00:00.000Z";

const offerResponse = {
  object: "openid4vc_issuance",
  id: "iss_123",
  status: "offer_created",
  credentialDefinitionId: "pension_credential_v1",
  credentials: [
    {
      credentialDefinitionId: "pension_credential_v1",
      format: "dc+sd-jwt",
      status: "offer_created",
    },
  ],
  offerUri:
    "openid-credential-offer://?credential_offer_uri=https%3A%2F%2Fissuer.example.com",
  offerQrUri:
    "openid-credential-offer://?credential_offer_uri=https%3A%2F%2Fissuer.example.com",
  credentialIssuer: "https://issuer.example.com/api/v1/openid4vci",
  issuanceMode: "InTime",
  txCodeRequired: true,
  createdAt: timestamp,
  updatedAt: timestamp,
  expiresAt: "2026-04-20T11:00:00.000Z",
  metadata: { demo: "tomorrow" },
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

describe("AuthboundClient issuer APIs", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse(offerResponse))
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("accepts Gateway secret keys and rejects publishable keys", () => {
    expect(
      () => new AuthboundClient({ apiKey: `sk_test_${"x".repeat(32)}` })
    ).not.toThrow();
    expect(
      () => new AuthboundClient({ apiKey: `sk_live_${"x".repeat(32)}` })
    ).not.toThrow();
    expect(
      () => new AuthboundClient({ apiKey: `pk_test_${"x".repeat(32)}` })
    ).toThrow(/sk_test_|sk_live_/);
  });

  it("lists credential definitions from the public Gateway endpoint", async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({
        object: "list",
        data: [
          {
            object: "issuer.credential_definition",
            id: "pension_credential_v1",
            credentialDefinitionId: "pension_credential_v1",
            format: "dc+sd-jwt",
            vct: "urn:vc:authbound:pension:1.0",
            title: "Pension Credential",
            claims: [],
          },
        ],
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await createClient().issuer.credentialDefinitions.list();

    expect(result.data[0]?.credentialDefinitionId).toBe(
      "pension_credential_v1"
    );
    expect(fetchMock).toHaveBeenCalledWith(
      `${apiUrl}/v1/issuer/credential-definitions`,
      expect.objectContaining({ method: "GET" })
    );
  });

  it("gets a credential definition by ID", async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({
        object: "issuer.credential_definition",
        id: "pension_credential_v1",
        credentialDefinitionId: "pension_credential_v1",
        format: "dc+sd-jwt",
        title: "Pension Credential",
        claims: [],
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await createClient().issuer.credentialDefinitions.get(
      "pension_credential_v1"
    );

    expect(result.object).toBe("issuer.credential_definition");
    expect(fetchMock).toHaveBeenCalledWith(
      `${apiUrl}/v1/issuer/credential-definitions/pension_credential_v1`,
      expect.objectContaining({ method: "GET" })
    );
  });

  it("creates, updates, and archives credential definitions", async () => {
    const definition = {
      object: "issuer.credential_definition",
      id: "pension_credential_v1",
      credentialDefinitionId: "pension_credential_v1",
      format: "dc+sd-jwt",
      vct: "urn:vc:authbound:pension:1.0",
      title: "Pension Credential",
      claims: [
        {
          name: "Pension.startDate",
          path: ["Pension", "startDate"],
          mandatory: true,
          displayName: "Start Date",
        },
      ],
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(definition, 201))
      .mockResolvedValueOnce(
        jsonResponse({ ...definition, title: "Updated Pension" })
      )
      .mockResolvedValueOnce(jsonResponse({ ...definition, archived: true }));
    vi.stubGlobal("fetch", fetchMock);

    const client = createClient();
    await client.issuer.credentialDefinitions.create({
      credentialDefinitionId: "pension_credential_v1",
      vct: "urn:vc:authbound:pension:1.0",
      format: "dc+sd-jwt",
      title: "Pension Credential",
      claims: [
        {
          path: ["Pension", "startDate"],
          mandatory: true,
          displayName: "Start Date",
        },
      ],
    });
    await client.issuer.credentialDefinitions.update("pension_credential_v1", {
      title: "Updated Pension",
    });
    await client.issuer.credentialDefinitions.archive("pension_credential_v1");

    expect(
      fetchMock.mock.calls.map(([url, init]) => [
        url,
        (init as RequestInit).method,
      ])
    ).toEqual([
      [`${apiUrl}/v1/issuer/credential-definitions`, "POST"],
      [
        `${apiUrl}/v1/issuer/credential-definitions/pension_credential_v1`,
        "PATCH",
      ],
      [
        `${apiUrl}/v1/issuer/credential-definitions/pension_credential_v1/archive`,
        "POST",
      ],
    ]);
  });

  it("rejects unsupported mDoc credential definition authoring before sending a request", async () => {
    const fetchMock = vi.fn(async () => jsonResponse(offerResponse));
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      createClient().issuer.credentialDefinitions.create({
        credentialDefinitionId: "mobile_driving_license_v1",
        vct: "org.iso.18013.5.1.mDL",
        format: "mso_mdoc" as never,
        title: "Mobile Driving Licence",
      })
    ).rejects.toMatchObject({
      name: "AuthboundClientError",
      code: "VALIDATION_ERROR",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("creates an OpenID4VC issuance offer and sends idempotency as a header", async () => {
    const fetchMock = vi.fn(async () => jsonResponse(offerResponse));
    vi.stubGlobal("fetch", fetchMock);

    const result = await createClient().openId4Vc.issuance.createOffer({
      credentialDefinitionId: "pension_credential_v1",
      claims: {
        Person: { given_name: "Sergio", family_name: "Jack" },
        Pension: { startDate: "2025-01-01" },
      },
      issuanceMode: "InTime",
      txCode: "1234",
      idempotencyKey: "idem_123",
    });

    expect(result.id).toBe("iss_123");

    const [, request] = fetchMock.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(fetchMock).toHaveBeenCalledWith(
      `${apiUrl}/v1/openid4vc/issuance/offer`,
      expect.objectContaining({ method: "POST" })
    );
    expect(request.headers).toMatchObject({
      "Content-Type": "application/json",
      "X-Authbound-Key": apiKey,
      "Idempotency-Key": "idem_123",
    });
    expect(JSON.parse(request.body as string)).toEqual({
      credentialDefinitionId: "pension_credential_v1",
      claims: {
        Person: { given_name: "Sergio", family_name: "Jack" },
        Pension: { startDate: "2025-01-01" },
      },
      issuanceMode: "InTime",
      txCode: "1234",
    });
  });

  it("lists, gets, updates, and cancels issuance sessions with the public paths", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({ object: "list", data: [offerResponse] })
      )
      .mockResolvedValueOnce(jsonResponse(offerResponse))
      .mockResolvedValueOnce(
        jsonResponse({ ...offerResponse, status: "ready_to_issue" })
      )
      .mockResolvedValueOnce(
        jsonResponse({ ...offerResponse, status: "canceled" })
      );
    vi.stubGlobal("fetch", fetchMock);

    const client = createClient();

    await client.openId4Vc.issuance.list({ limit: 10, cursor: "cur_123" });
    await client.openId4Vc.issuance.get("iss_123");
    await client.openId4Vc.issuance.update("iss_123", {
      claims: { Pension: { startDate: "2025-02-01" } },
    });
    await client.openId4Vc.issuance.cancel("iss_123");

    expect(
      fetchMock.mock.calls.map(([url, init]) => [
        url,
        (init as RequestInit).method,
      ])
    ).toEqual([
      [`${apiUrl}/v1/openid4vc/issuance?limit=10&cursor=cur_123`, "GET"],
      [`${apiUrl}/v1/openid4vc/issuance/iss_123`, "GET"],
      [`${apiUrl}/v1/openid4vc/issuance/iss_123`, "PATCH"],
      [`${apiUrl}/v1/openid4vc/issuance/iss_123/cancel`, "POST"],
    ]);
  });

  it("fails closed when the API response does not match the public schema", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse({ object: "credential_issuance" }))
    );

    await expect(
      createClient().openId4Vc.issuance.createOffer({
        vct: "urn:vc:authbound:pension:1.0",
        claims: { Pension: { startDate: "2025-01-01" } },
      })
    ).rejects.toMatchObject({
      name: "AuthboundClientError",
      code: "INVALID_RESPONSE",
    });
  });

  it("converts public API errors to AuthboundClientError", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        jsonResponse(
          {
            object: "error",
            code: "credential_definition_not_found",
            message: "Credential definition not found",
          },
          404
        )
      )
    );

    await expect(
      createClient().openId4Vc.issuance.get("missing")
    ).rejects.toMatchObject({
      name: "AuthboundClientError",
      code: "credential_definition_not_found",
      statusCode: 404,
    });
  });
});
