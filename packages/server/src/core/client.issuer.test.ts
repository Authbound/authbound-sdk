import {
  afterEach,
  beforeEach,
  describe,
  expect,
  expectTypeOf,
  it,
  vi,
} from "vitest";

import type {
  ArchivedCredentialDefinition,
  CreateCredentialDefinitionDraftOptions,
  CreateCredentialDefinitionOptions,
  DraftCredentialDefinition,
  PublishedCredentialDefinition,
  UpdateCredentialDefinitionOptions,
} from "../index";

import { AuthboundClient, AuthboundClientError } from "./client";

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

function credentialDefinitionResponse(
  lifecycleStatus: "draft" | "published" | "archived" = "published",
  overrides: Record<string, unknown> = {}
): Record<string, unknown> {
  return {
    object: "issuer.credential_definition",
    id: "employee_badge_v1",
    credentialDefinitionId: "employee_badge_v1",
    vct: "urn:vc:authbound:employee-badge:1.0",
    format: "dc+sd-jwt",
    title: "Employee Badge",
    claims: [],
    aliases: [],
    lifecycleStatus,
    ...overrides,
  };
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

  it("accepts API secret keys and rejects publishable keys", () => {
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

  it("lists credential definitions with lifecycleStatus mapped to lifecycle_status", async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({
        object: "list",
        data: [credentialDefinitionResponse("draft")],
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await createClient().issuer.credentialDefinitions.list({
      lifecycleStatus: "draft",
    });

    expect(result.data[0]?.credentialDefinitionId).toBe("employee_badge_v1");
    expect(fetchMock).toHaveBeenCalledWith(
      `${apiUrl}/v1/issuer/credential-definitions?lifecycle_status=draft`,
      expect.objectContaining({ method: "GET" })
    );
  });

  it("parses read-only mso_mdoc credential definitions", async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse(
        credentialDefinitionResponse("published", {
          id: "mobile_driving_license_v1",
          credentialDefinitionId: "mobile_driving_license_v1",
          format: "mso_mdoc",
          vct: "org.iso.18013.5.1.mDL",
          title: "Mobile Driving Licence",
        })
      )
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await createClient().issuer.credentialDefinitions.get(
      "mobile_driving_license_v1"
    );

    expect(result.format).toBe("mso_mdoc");
    expect(fetchMock).toHaveBeenCalledWith(
      `${apiUrl}/v1/issuer/credential-definitions/mobile_driving_license_v1`,
      expect.objectContaining({ method: "GET" })
    );
  });

  it("sends explicit lifecycle intent for published and draft creation", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse(credentialDefinitionResponse("published"), 201)
      )
      .mockResolvedValueOnce(
        jsonResponse(
          credentialDefinitionResponse("draft", {
            id: "employee_badge_v2",
            credentialDefinitionId: "employee_badge_v2",
            vct: "urn:vc:authbound:employee-badge:2.0",
            title: "Employee Badge v2",
          }),
          201
        )
      );
    vi.stubGlobal("fetch", fetchMock);

    const client = createClient();
    await client.issuer.credentialDefinitions.create({
      credentialDefinitionId: "employee_badge_v1",
      vct: "urn:vc:authbound:employee-badge:1.0",
      format: "dc+sd-jwt",
      title: "Employee Badge",
      claims: [
        {
          path: ["employee_id"],
          displayName: "Employee ID",
        },
      ],
    });
    await client.issuer.credentialDefinitions.createDraft({
      credentialDefinitionId: "employee_badge_v2",
      vct: "urn:vc:authbound:employee-badge:2.0",
      format: "dc+sd-jwt",
      title: "Employee Badge v2",
    });

    const sentJsonBodies = fetchMock.mock.calls.map(([, request]) =>
      JSON.parse((request as RequestInit).body as string)
    );
    expect(sentJsonBodies).toEqual([
      expect.objectContaining({ lifecycleStatus: "published" }),
      expect.objectContaining({ lifecycleStatus: "draft" }),
    ]);
  });

  it("creates credential definitions with idempotency as a header", async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse(credentialDefinitionResponse("published"), 201)
    );
    vi.stubGlobal("fetch", fetchMock);

    await createClient().issuer.credentialDefinitions.create({
      credentialDefinitionId: "pension_credential_v1",
      vct: "urn:vc:authbound:pension:1.0",
      format: "dc+sd-jwt",
      title: "Pension Credential",
      claims: [],
      idempotencyKey: "idem_123",
    });

    const [, request] = fetchMock.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(fetchMock).toHaveBeenCalledWith(
      `${apiUrl}/v1/issuer/credential-definitions`,
      expect.objectContaining({ method: "POST" })
    );
    expect(request.headers).toMatchObject({
      "Content-Type": "application/json",
      "X-Authbound-Key": apiKey,
      "Idempotency-Key": "idem_123",
    });
    expect(JSON.parse(request.body as string)).toEqual({
      credentialDefinitionId: "pension_credential_v1",
      vct: "urn:vc:authbound:pension:1.0",
      format: "dc+sd-jwt",
      title: "Pension Credential",
      claims: [],
      lifecycleStatus: "published",
    });
  });

  it("publishes through the resource route with idempotency only in the header", async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse(
        credentialDefinitionResponse("published", {
          id: "employee_badge_v2",
          credentialDefinitionId: "employee_badge_v2",
          vct: "urn:vc:authbound:employee-badge:2.0",
        })
      )
    );
    vi.stubGlobal("fetch", fetchMock);

    await createClient().issuer.credentialDefinitions.publish(
      "employee_badge_v2",
      { idempotencyKey: "publish:employee_badge_v2:v1" }
    );

    const [url, request] = fetchMock.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect({
      url,
      method: request.method,
      headers: request.headers,
    }).toMatchObject({
      url: `${apiUrl}/v1/issuer/credential-definitions/employee_badge_v2/publish`,
      method: "POST",
      headers: expect.objectContaining({
        "Idempotency-Key": "publish:employee_badge_v2:v1",
      }),
    });
    expect(request.body).toBeUndefined();
  });

  it.each([
    "lifecycleStatus",
    "vct",
    "aliases",
    "claims",
  ])("fails closed when a credential definition response omits %s", async (missingField) => {
    const response = credentialDefinitionResponse();
    delete response[missingField];
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse(response))
    );

    await expect(
      createClient().issuer.credentialDefinitions.get("employee_badge_v1")
    ).rejects.toMatchObject({
      name: "AuthboundClientError",
      code: "INVALID_RESPONSE",
    });
  });

  it("rejects wrong lifecycle responses from update and archive", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse(credentialDefinitionResponse("published"))
      )
      .mockResolvedValueOnce(
        jsonResponse(credentialDefinitionResponse("draft"))
      );
    vi.stubGlobal("fetch", fetchMock);

    const client = createClient();
    await expect(
      client.issuer.credentialDefinitions.update("employee_badge_v2", {
        title: "Employee Badge v2",
      })
    ).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
    await expect(
      client.issuer.credentialDefinitions.archive("employee_badge_v2")
    ).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
  });

  it("exposes exact lifecycle-specific option and return types", () => {
    const credentialDefinitions = createClient().issuer.credentialDefinitions;

    expectTypeOf(credentialDefinitions.create)
      .parameter(0)
      .toEqualTypeOf<CreateCredentialDefinitionOptions>();
    expectTypeOf(
      credentialDefinitions.create
    ).returns.resolves.toEqualTypeOf<PublishedCredentialDefinition>();
    expectTypeOf(credentialDefinitions.createDraft)
      .parameter(0)
      .toEqualTypeOf<CreateCredentialDefinitionDraftOptions>();
    expectTypeOf(
      credentialDefinitions.createDraft
    ).returns.resolves.toEqualTypeOf<DraftCredentialDefinition>();
    expectTypeOf(
      credentialDefinitions.publish
    ).returns.resolves.toEqualTypeOf<PublishedCredentialDefinition>();
    expectTypeOf(credentialDefinitions.update)
      .parameter(1)
      .toEqualTypeOf<UpdateCredentialDefinitionOptions>();
    expectTypeOf(
      credentialDefinitions.update
    ).returns.resolves.toEqualTypeOf<DraftCredentialDefinition>();
    expectTypeOf(
      credentialDefinitions.archive
    ).returns.resolves.toEqualTypeOf<ArchivedCredentialDefinition>();
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
        claims: [],
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

  it("redacts OpenID4VCI offer material from API errors", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        jsonResponse(
          {
            object: "error",
            code: "bad_request",
            message:
              "Offer rejected for credential_offer_uri=https://issuer.example.com/offers/credential-offer.jwt?pre-authorized_code=pre_auth_secret&tx_code=123456",
            param:
              'credential_offer={"grants":{"urn:ietf:params:oauth:grant-type:pre-authorized_code":{"pre-authorized_code":"pre_auth_secret"}}}',
          },
          400
        )
      )
    );

    let thrown: unknown;
    try {
      await createClient().openId4Vc.issuance.createOffer({
        vct: "urn:vc:authbound:pension:1.0",
        claims: { Pension: { startDate: "2025-01-01" } },
      });
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(AuthboundClientError);
    const serialized = JSON.stringify({
      message: (thrown as AuthboundClientError).message,
      details: (thrown as AuthboundClientError).details,
    });
    expect(serialized).not.toContain("credential-offer.jwt");
    expect(serialized).not.toContain("pre_auth_secret");
    expect(serialized).not.toContain("123456");
  });
});
