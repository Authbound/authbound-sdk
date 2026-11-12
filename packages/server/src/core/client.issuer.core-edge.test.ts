import { readFileSync } from "node:fs";
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
  CreateCoreCredentialDefinitionOptions,
  CreateCredentialDefinitionDraftOptions,
  CreateCredentialDefinitionOptions,
  ListCredentialDefinitionsOptions,
  UpdateCredentialDefinitionOptions,
} from "../index";

import { AuthboundClient } from "./client";

// Byte-identical copy of the monorepo's pinned core Edge contract fixture,
// services/edge-api/app/src/test/resources/contracts/event-ticket-definition-sdk.json.
// `definition` is a real core Edge response; `create` is the rc.0 body Edge rejects.
const fixture = JSON.parse(
  readFileSync(
    new URL(
      "./__fixtures__/core-edge-credential-definition.json",
      import.meta.url
    ),
    "utf8"
  )
) as {
  definition: Record<string, unknown> & { claims: Record<string, unknown>[] };
  create: Record<string, unknown>;
};

const apiKey = `sk_test_${"x".repeat(32)}`;
const apiUrl = "https://api.example.com";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function createClient(): AuthboundClient {
  return new AuthboundClient({ apiKey, apiUrl });
}

function sentRequest(fetchMock: ReturnType<typeof vi.fn>, index = 0) {
  const [url, request] = fetchMock.mock.calls[index] as unknown as [
    string,
    RequestInit,
  ];
  return {
    url,
    method: request.method,
    headers: request.headers,
    body:
      typeof request.body === "string" ? JSON.parse(request.body) : undefined,
  };
}

// Core Edge's metadata rule (control-plane CredentialDefinitionAuthoring):
// at most 8 KiB of UTF-8 JSON, at most 8 nested objects or arrays, no nulls.
const MAX_CORE_METADATA_BYTES = 8 * 1024;

function nestedMetadata(containers: number): Record<string, unknown> {
  let value: Record<string, unknown> = { leaf: 1 };
  for (let level = 1; level < containers; level += 1) {
    value = { nested: value };
  }
  return value;
}

// `{"note":"..."}` around `count` copies of `character`.
function noteMetadata(character: string, count: number) {
  return { note: character.repeat(count) };
}

function metadataBytes(metadata: unknown): number {
  return new TextEncoder().encode(JSON.stringify(metadata)).length;
}

const noteOverhead = metadataBytes(noteMetadata("", 0));

const coreCreateOptions: CreateCoreCredentialDefinitionOptions = {
  credentialDefinitionId: "event_ticket_authbound",
  display: [{ locale: "en", name: "Event Ticket Admission" }],
  claims: [
    {
      path: ["event_id"],
      type: "string",
      mandatory: true,
      display: [{ locale: "en", name: "Event ID" }],
      maxLength: 128,
    },
    { path: ["valid_from"], type: "datetime", mandatory: true },
    { path: ["valid_until"], type: "datetime", mandatory: true },
  ],
  validity: {
    notBeforeClaim: "valid_from",
    expiresClaim: "valid_until",
    maxSeconds: 2_592_000,
    boundedBySignerCertificate: true,
  },
  uniqueness: { claims: [["event_id"]] },
};

describe("AuthboundClient issuer credential definitions on core Edge", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn(async () => jsonResponse(fixture.definition));
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("parses the pinned core Edge definition through get", async () => {
    const result = await createClient().issuer.credentialDefinitions.get(
      "event_ticket_authbound"
    );

    expect(result).toEqual(fixture.definition);
    expect(result.version).toBe(5);
    expect(result.curated).toBe(true);
    expect(result.updatedAt).toBe("2026-11-03T00:00:00Z");
    expect(result.display).toEqual([
      { locale: "en", name: "Event Ticket Admission" },
    ]);
    expect(result.validity).toMatchObject({
      notBeforeClaim: "valid_from",
      boundedBySignerCertificate: true,
    });
    expect(result.uniqueness?.claims).toEqual([["event_id"], ["ticket_id"]]);
    expect(result.claims[3]).toMatchObject({
      type: "datetime",
      display: [{ locale: "en", name: "Valid from" }],
    });
  });

  it("lists core Edge definitions with limit, cursor and nextCursor", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        object: "list",
        data: [fixture.definition],
        nextCursor: "next_page",
      })
    );

    const result = await createClient().issuer.credentialDefinitions.list({
      lifecycleStatus: "published",
      limit: 2,
      cursor: "abc",
    });

    expect(sentRequest(fetchMock).url).toBe(
      `${apiUrl}/v1/issuer/credential-definitions?lifecycle_status=published&limit=2&cursor=abc`
    );
    expect(result.nextCursor).toBe("next_page");
    expect(result.data[0]?.display?.[0]?.name).toBe("Event Ticket Admission");
  });

  it("sends limit and cursor without a lifecycle filter", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ object: "list", data: [] }));

    const result = await createClient().issuer.credentialDefinitions.list({
      limit: 2,
      cursor: "abc",
    });

    expect(sentRequest(fetchMock).url).toBe(
      `${apiUrl}/v1/issuer/credential-definitions?limit=2&cursor=abc`
    );
    expect(result.nextCursor).toBeUndefined();
  });

  it("creates a core definition with exactly the core body", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(fixture.definition, 201));

    const result = await createClient().issuer.credentialDefinitions.create({
      ...coreCreateOptions,
      idempotencyKey: "create:event_ticket_authbound",
    });

    const request = sentRequest(fetchMock);
    expect(request.method).toBe("POST");
    expect(request.body).toEqual(coreCreateOptions);
    expect(request.body).not.toHaveProperty("title");
    expect(request.body).not.toHaveProperty("lifecycleStatus");
    expect(request.body).not.toHaveProperty("vct");
    expect(request.body).not.toEqual(fixture.create);
    expect(request.headers).toMatchObject({
      "Idempotency-Key": "create:event_ticket_authbound",
    });
    expect(result.lifecycleStatus).toBe("published");
    expect(result.validity?.maxSeconds).toBe(2_592_000);
  });

  it("sends an explicit vct and format on core create", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(fixture.definition, 201));

    await createClient().issuer.credentialDefinitions.create({
      ...coreCreateOptions,
      vct: "urn:example:event-ticket:1",
      format: "dc+sd-jwt",
    });

    expect(sentRequest(fetchMock).body).toMatchObject({
      vct: "urn:example:event-ticket:1",
      format: "dc+sd-jwt",
    });
  });

  it.each([
    ["title", { title: "Event Ticket Admission" }],
    ["rendering", { rendering: { simple: { text_color: "#FFFFFF" } } }],
  ])("refuses a create body mixing display with %s", async (_field, extra) => {
    const mixed = { ...coreCreateOptions, ...extra };

    await expect(
      createClient().issuer.credentialDefinitions.create(
        mixed as unknown as CreateCoreCredentialDefinitionOptions
      )
    ).rejects.toMatchObject({
      name: "AuthboundClientError",
      code: "VALIDATION_ERROR",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("refuses a core create with an empty display", async () => {
    await expect(
      createClient().issuer.credentialDefinitions.create({
        ...coreCreateOptions,
        display: [],
      })
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("refuses display on createDraft, which core Edge does not support", async () => {
    const draftWithDisplay = {
      credentialDefinitionId: "event_ticket_authbound",
      vct: "urn:example:event-ticket:1",
      format: "dc+sd-jwt",
      title: "Event Ticket Admission",
      display: [{ locale: "en", name: "Event Ticket Admission" }],
    };

    await expect(
      createClient().issuer.credentialDefinitions.createDraft(
        draftWithDisplay as unknown as CreateCredentialDefinitionDraftOptions
      )
    ).rejects.toMatchObject({
      code: "VALIDATION_ERROR",
      message: expect.stringContaining("display"),
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("updates with display and parses the published core response", async () => {
    const result = await createClient().issuer.credentialDefinitions.update(
      "event_ticket_authbound",
      {
        display: [
          { locale: "en", name: "Event Ticket Admission" },
          { locale: "fi", name: "Tapahtumalippu" },
        ],
        validity: { durationSeconds: 86_400 },
        uniqueness: { claims: [["ticket_id"]] },
        claims: [{ path: ["ticket_id"], type: "string", mandatory: true }],
      }
    );

    const request = sentRequest(fetchMock);
    expect(request.method).toBe("PATCH");
    expect(request.url).toBe(
      `${apiUrl}/v1/issuer/credential-definitions/event_ticket_authbound`
    );
    expect(request.body).toEqual({
      display: [
        { locale: "en", name: "Event Ticket Admission" },
        { locale: "fi", name: "Tapahtumalippu" },
      ],
      validity: { durationSeconds: 86_400 },
      uniqueness: { claims: [["ticket_id"]] },
      claims: [{ path: ["ticket_id"], type: "string", mandatory: true }],
    });
    expect(result.lifecycleStatus).toBe("published");
    expect(result.version).toBe(5);
  });

  it.each([
    ["title", { title: "Event Ticket Admission" }],
    ["rendering", { rendering: { simple: { text_color: "#FFFFFF" } } }],
  ])("refuses an update mixing display with %s", async (_field, extra) => {
    const mixed = {
      display: [{ locale: "en", name: "Event Ticket Admission" }],
      ...extra,
    };

    await expect(
      createClient().issuer.credentialDefinitions.update(
        "event_ticket_authbound",
        mixed as unknown as UpdateCredentialDefinitionOptions
      )
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("updates only validity and parses the published core response", async () => {
    const result = await createClient().issuer.credentialDefinitions.update(
      "event_ticket_authbound",
      { validity: { durationSeconds: 86_400 } }
    );

    expect(sentRequest(fetchMock).body).toEqual({
      validity: { durationSeconds: 86_400 },
    });
    expect(result.lifecycleStatus).toBe("published");
  });

  it("treats an undefined title as absent on core create", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(fixture.definition, 201));

    await createClient().issuer.credentialDefinitions.create({
      ...coreCreateOptions,
      title: undefined,
      rendering: undefined,
    });

    expect(sentRequest(fetchMock).body).toEqual(coreCreateOptions);
  });

  it("keeps a hosted create with an undefined display on the hosted shape", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(
        {
          object: "issuer.credential_definition",
          id: "employee_badge_v1",
          credentialDefinitionId: "employee_badge_v1",
          vct: "urn:vc:authbound:employee-badge:1.0",
          format: "dc+sd-jwt",
          title: "Employee Badge",
          claims: [],
          aliases: [],
          lifecycleStatus: "published",
        },
        201
      )
    );

    await createClient().issuer.credentialDefinitions.create({
      credentialDefinitionId: "employee_badge_v1",
      vct: "urn:vc:authbound:employee-badge:1.0",
      format: "dc+sd-jwt",
      title: "Employee Badge",
      claims: [],
      display: undefined,
    });

    expect(sentRequest(fetchMock).body).toEqual({
      credentialDefinitionId: "employee_badge_v1",
      vct: "urn:vc:authbound:employee-badge:1.0",
      format: "dc+sd-jwt",
      title: "Employee Badge",
      claims: [],
      lifecycleStatus: "published",
    });
  });

  it.each([
    ["8 nested containers with a plain leaf", nestedMetadata(8)],
    ["a 3000-character string", noteMetadata("a", 3000)],
    [
      "200 keys",
      Object.fromEntries(
        Array.from({ length: 200 }, (_, index) => [`k${index}`, index])
      ),
    ],
    ["1500 array items", { items: Array.from({ length: 1500 }, () => 0) }],
    [
      "exactly 8 KiB",
      noteMetadata("a", MAX_CORE_METADATA_BYTES - noteOverhead),
    ],
  ])("accepts core Edge metadata with %s", async (_shape, metadata) => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ ...fixture.definition, metadata })
    );

    await expect(
      createClient().issuer.credentialDefinitions.get("event_ticket_authbound")
    ).resolves.toMatchObject({ metadata });
  });

  it("parses a core create response carrying core-maximum metadata", async () => {
    const metadata = noteMetadata("a", MAX_CORE_METADATA_BYTES - noteOverhead);
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ ...fixture.definition, metadata }, 201)
    );

    await expect(
      createClient().issuer.credentialDefinitions.create(coreCreateOptions)
    ).resolves.toMatchObject({ metadata });
  });

  // Each of these also breaks the hosted rule (strings of at most 2048
  // characters), so only core's own bounds could have accepted them.
  it.each([
    [
      "one byte over 8 KiB",
      noteMetadata("a", MAX_CORE_METADATA_BYTES - noteOverhead + 1),
    ],
    [
      "over 8 KiB in UTF-8 but not in characters",
      noteMetadata(
        "\u00e4",
        Math.ceil((MAX_CORE_METADATA_BYTES - noteOverhead + 1) / 2)
      ),
    ],
    ["9 nested containers", { ...nestedMetadata(9), note: "a".repeat(3000) }],
    ["a null", { ...noteMetadata("a", 3000), gone: null }],
  ])("refuses metadata with %s", async (_shape, metadata) => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ ...fixture.definition, metadata })
    );

    await expect(
      createClient().issuer.credentialDefinitions.get("event_ticket_authbound")
    ).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
  });

  it.each([
    ["the definition", { unexpected: true }],
    [
      "a claim",
      { claims: [{ ...fixture.definition.claims[0], unexpected: true }] },
    ],
    [
      "a display entry",
      { display: [{ locale: "en", name: "Event", unexpected: true }] },
    ],
    [
      "validity",
      { validity: { boundedBySignerCertificate: false, unexpected: true } },
    ],
    ["uniqueness", { uniqueness: { claims: [["event_id"]], unexpected: 1 } }],
  ])("fails closed on an unknown member in %s", async (_where, overrides) => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ ...fixture.definition, ...overrides })
    );

    await expect(
      createClient().issuer.credentialDefinitions.get("event_ticket_authbound")
    ).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
  });

  it("fails closed on a claim type outside the core enum", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        ...fixture.definition,
        claims: [{ ...fixture.definition.claims[0], type: "number" }],
      })
    );

    await expect(
      createClient().issuer.credentialDefinitions.get("event_ticket_authbound")
    ).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
  });

  it("exposes the list paging options", () => {
    expectTypeOf(createClient().issuer.credentialDefinitions.list)
      .parameter(0)
      .toEqualTypeOf<ListCredentialDefinitionsOptions | undefined>();
  });

  it("refuses display mixed with title or rendering at compile time", () => {
    const display = [{ locale: "en", name: "Event Ticket Admission" }];

    expectTypeOf({
      ...coreCreateOptions,
      title: "Event Ticket Admission",
    }).not.toExtend<
      CreateCredentialDefinitionOptions | CreateCoreCredentialDefinitionOptions
    >();
    expectTypeOf({
      ...coreCreateOptions,
      rendering: { simple: { text_color: "#FFFFFF" } },
    }).not.toExtend<
      CreateCredentialDefinitionOptions | CreateCoreCredentialDefinitionOptions
    >();
    expectTypeOf({
      display,
      title: "Event Ticket Admission",
    }).not.toExtend<UpdateCredentialDefinitionOptions>();
    expectTypeOf({
      display,
      rendering: { simple: { text_color: "#FFFFFF" } },
    }).not.toExtend<UpdateCredentialDefinitionOptions>();
    expectTypeOf({
      display,
      validity: { durationSeconds: 86_400 },
    }).toExtend<UpdateCredentialDefinitionOptions>();
  });
});
