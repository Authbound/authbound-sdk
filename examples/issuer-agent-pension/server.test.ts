import assert from "node:assert/strict";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, it } from "node:test";
import type {
  ApiVerificationStatus,
  AuthboundClient,
  CreateCredentialDefinitionOptions,
  CredentialDefinition,
  OpenId4VcIssuanceOffer,
  SignedVerificationResult,
  Verification,
} from "@authbound/server";
import { AuthboundClientError } from "@authbound/server";
import {
  createPensionCredentialDefinition,
  pensionCredentialClaims,
} from "./pension-flow.ts";
import { createApp, listCredentials } from "./server.ts";
import { parsePensionCredential } from "./utils.ts";

type MockFunction<Args extends unknown[], Return> = ((
  ...args: Args
) => Return) & {
  calls: Args[];
};

function mockFunction<Args extends unknown[], Return>(
  implementation: (...args: Args) => Return
): MockFunction<Args, Return> {
  const calls: Args[] = [];
  const fn = ((...args: Args) => {
    calls.push(args);
    return implementation(...args);
  }) as MockFunction<Args, Return>;
  fn.calls = calls;
  return fn;
}

async function withAppServer<T>(
  app: ReturnType<typeof createApp>,
  run: (baseUrl: string) => Promise<T>
) {
  const server: Server = app.listen(0);
  try {
    const address = server.address() as AddressInfo;
    return await run(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
}

function credentialDefinition(
  credentialDefinitionId: string,
  lifecycleStatus: CredentialDefinition["lifecycleStatus"] = "published"
): CredentialDefinition {
  return {
    object: "issuer.credential_definition",
    id: `cd_${credentialDefinitionId}`,
    credentialDefinitionId,
    format: "dc+sd-jwt",
    vct: "urn:vc:authbound:pension:1.0",
    title: "Pension Credential",
    claims: [],
    aliases: ["pension"],
    lifecycleStatus,
  };
}

function issuanceOffer(): OpenId4VcIssuanceOffer {
  return {
    object: "openid4vc_issuance",
    id: "offer_test",
    status: "offer_created",
    credentialDefinitionId: "pension-credential",
    credentials: [],
    offerUri: "openid-credential-offer://example.test",
    offerQrUri: "https://example.test/offer/qr",
    credentialIssuer: "https://issuer.example.test",
    issuanceMode: "InTime",
    txCodeRequired: false,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}

function verification(overrides: Partial<Verification> = {}): Verification {
  return {
    object: "verification",
    id: "vrf_test",
    status: "created",
    ...overrides,
  };
}

function verificationStatus(
  overrides: Partial<ApiVerificationStatus> = {}
): ApiVerificationStatus {
  return {
    object: "verification_status",
    id: "vrf_test",
    status: "created",
    ...overrides,
  };
}

function signedResult(verificationId: string): SignedVerificationResult {
  return {
    verificationId,
    status: "verified",
    resultToken: "result_token",
  };
}

function createMockClient(options: {
  credentialDefinitions?: Partial<
    Pick<
      AuthboundClient["issuer"]["credentialDefinitions"],
      "create" | "get" | "publish"
    >
  >;
  verifications?: Partial<
    Pick<AuthboundClient["verifications"], "create" | "getStatus" | "getResult">
  >;
}): AuthboundClient {
  const mockClient = {
    issuer: {
      credentialDefinitions: {
        get: async (credentialDefinitionId) =>
          credentialDefinition(credentialDefinitionId),
        create: async ({ credentialDefinitionId }) =>
          credentialDefinition(credentialDefinitionId),
        publish: async (credentialDefinitionId) =>
          credentialDefinition(credentialDefinitionId),
        ...options.credentialDefinitions,
      },
    },
    openId4Vc: {
      issuance: {
        createOffer: async () => issuanceOffer(),
      },
    },
    verifications: {
      create: async () => verification(),
      getStatus: async () => verificationStatus(),
      getResult: async (verificationId) => signedResult(verificationId),
      ...options.verifications,
    },
  };
  return mockClient as unknown as AuthboundClient;
}

describe("issuer-agent-pension example", () => {
  afterEach(() => {
    delete process.env.AUTHBOUND_SECRET_KEY;
    delete process.env.AUTHBOUND_PUBLISHABLE_KEY;
  });

  it("loads pension type codes from JSON fixtures", async () => {
    const credentials = await listCredentials();

    assert.deepEqual(
      credentials.map(({ slug, credential }) => ({
        slug,
        typeCode: credential.credentialSubject.Pension.typeCode,
        typeName: credential.credentialSubject.Pension.typeName,
        language: credential.credentialSubject.Pension["@language"],
        birthDate: credential.credentialSubject.Person.birth_date,
      })),
      [
        {
          slug: "kael",
          typeCode: "KAEL",
          typeName: "Kansaneläke",
          language: "fi_FI",
          birthDate: "1993-03-03",
        },
        {
          slug: "tkel-provisional",
          typeCode: "TKEL",
          typeName: "Pysyvä työkyvyttömyyseläke",
          language: "fi_FI",
          birthDate: "1983-12-10",
        },
        {
          slug: "tkel-disability",
          typeCode: "TKEL",
          typeName: "Pysyvä työkyvyttömyyseläke",
          language: "fi_FI",
          birthDate: "1973-09-01",
        },
        {
          slug: "kuki",
          typeCode: "KUKI",
          typeName: "Kuntoutustuki",
          language: "fi_FI",
          birthDate: "2005-10-01",
        },
        {
          slug: "kuki-expired",
          typeCode: "KUKI",
          typeName: "Rehabiliteringsstöd",
          language: "sv_FI",
          birthDate: "2003-12-03",
        },
      ]
    );
  });

  it("omits JSON-LD language metadata from new credential definitions", async () => {
    let createOptions: CreateCredentialDefinitionOptions | undefined;
    const client = createMockClient({
      credentialDefinitions: {
        get: async () => {
          throw new AuthboundClientError(
            "Credential definition not found",
            "credential_definition_not_found",
            404
          );
        },
        create: async (options) => {
          createOptions = options;
          return credentialDefinition(options.credentialDefinitionId);
        },
      },
    });

    await createPensionCredentialDefinition(client, "pension-credential");

    assert.ok(createOptions);
    assert.equal(
      createOptions.claims?.some(
        ({ path }) =>
          path.length === 2 && path[0] === "Pension" && path[1] === "@language"
      ),
      false
    );
  });

  it("rethrows untyped not-found-shaped errors without creating", async () => {
    const untypedNotFound = Object.assign(new Error("not found"), {
      code: "credential_definition_not_found",
    });
    const create = mockFunction(
      async ({ credentialDefinitionId }: { credentialDefinitionId: string }) =>
        credentialDefinition(credentialDefinitionId, "published")
    );
    const client = createMockClient({
      credentialDefinitions: {
        get: async () => {
          throw untypedNotFound;
        },
        create,
      },
    });

    await assert.rejects(
      () => createPensionCredentialDefinition(client, "pension-credential"),
      (error) => error === untypedNotFound
    );
    assert.equal(create.calls.length, 0);
  });

  it("reuses a published definition", async () => {
    const get = mockFunction(async () =>
      credentialDefinition("pension-credential", "published")
    );
    const create = mockFunction(
      async ({ credentialDefinitionId }: { credentialDefinitionId: string }) =>
        credentialDefinition(credentialDefinitionId, "published")
    );
    const publish = mockFunction(async (credentialDefinitionId: string) =>
      credentialDefinition(credentialDefinitionId, "published")
    );
    const client = createMockClient({
      credentialDefinitions: { get, create, publish },
    });

    const definition = await createPensionCredentialDefinition(
      client,
      "pension-credential"
    );

    assert.equal(definition.lifecycleStatus, "published");
    assert.equal(publish.calls.length, 0);
    assert.equal(create.calls.length, 0);
  });

  it("publishes only the known owned pension draft", async () => {
    const publish = mockFunction(
      async (
        credentialDefinitionId: string,
        _options?: { idempotencyKey?: string }
      ) => credentialDefinition(credentialDefinitionId, "published")
    );
    const client = createMockClient({
      credentialDefinitions: {
        get: async () => credentialDefinition("pension-credential", "draft"),
        publish,
      },
    });

    await createPensionCredentialDefinition(client, "pension-credential");

    assert.deepEqual(publish.calls, [
      [
        "pension-credential",
        { idempotencyKey: "publish:pension-credential:v1" },
      ],
    ]);
  });

  it("rejects archived definitions with new-version guidance", async () => {
    const client = createMockClient({
      credentialDefinitions: {
        get: async () => credentialDefinition("pension-credential", "archived"),
      },
    });

    await assert.rejects(
      () => createPensionCredentialDefinition(client, "pension-credential"),
      /Create a new credential definition version/
    );
  });

  it("omits JSON-LD language metadata from Authbound issuance claims", async () => {
    const [credential] = await listCredentials();

    assert.deepEqual(pensionCredentialClaims(credential.credential), {
      Person: {
        given_name: "Totti",
        family_name: "Aalto",
        birth_date: "1993-03-03",
        personal_administrative_number: "030393-995E",
      },
      Pension: {
        typeCode: "KAEL",
        typeName: "Kansaneläke",
        startDate: "2024-02-01",
      },
    });
  });

  it("renders the first-commit demo UI shell", async () => {
    const app = createApp({ createClient: () => createMockClient({}) });

    await withAppServer(app, async (baseUrl) => {
      const response = await fetch(baseUrl);
      const html = await response.text();

      assert.equal(response.ok, true);
      assert.match(html, /Eläkeläistodiste — Kela demo/);
      assert.match(html, /class="topbar"/);
      assert.match(html, /class="tabs"/);
      assert.match(html, /class="wallet-link"/);
      assert.match(html, /\* \{ box-sizing: border-box; \}/);
      assert.match(html, /word-break: break-all/);
      assert.match(
        html,
        /<option value="kael" selected>Totti Aalto \(KAEL\)<\/option>/
      );
      assert.doesNotMatch(html, /id="issue-button" disabled/);
    });
  });

  it("requires an explicit credential slug when creating offers", async () => {
    const app = createApp({ createClient: () => createMockClient({}) });

    await withAppServer(app, async (baseUrl) => {
      const response = await fetch(`${baseUrl}/offer`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });

      assert.equal(response.status, 400);
    });
  });

  it("returns created status codes for offer and verification creation", async () => {
    process.env.AUTHBOUND_PUBLISHABLE_KEY = "pk_test_123";
    const create = mockFunction(async () =>
      verification({
        id: "vrf_created",
        status: "created",
        clientToken: "client_token_123",
        expiresAt: "2999-01-01T00:00:00.000Z",
        clientAction: {
          kind: "qr",
          data: "openid4vp://authorize?request_uri=https%3A%2F%2Fexample.test",
        },
      })
    );
    const app = createApp({
      createClient: () => createMockClient({ verifications: { create } }),
    });

    await withAppServer(app, async (baseUrl) => {
      const offerResponse = await fetch(`${baseUrl}/offer`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug: "kael" }),
      });
      const verificationResponse = await fetch(`${baseUrl}/verify`, {
        method: "POST",
      });

      assert.equal(offerResponse.status, 201);
      assert.equal(verificationResponse.status, 201);
    });
  });

  it("does not encode a hosted verification URL as a wallet QR code", async () => {
    process.env.AUTHBOUND_PUBLISHABLE_KEY = "pk_test_123";
    const create = mockFunction(async () =>
      verification({
        id: "vrf_hosted_only",
        status: "created",
        clientToken: "client_token_123",
        expiresAt: "2999-01-01T00:00:00.000Z",
        verificationUrl: "https://app.authbound.io/v/vrf_hosted_only",
      })
    );
    const app = createApp({
      createClient: () => createMockClient({ verifications: { create } }),
    });

    await withAppServer(app, async (baseUrl) => {
      const response = await fetch(`${baseUrl}/verify`, { method: "POST" });

      assert.equal(response.status, 500);
      assert.doesNotMatch(await response.text(), /<svg/);
    });
  });

  it("rejects impossible calendar dates in JSON fixtures", () => {
    assert.throws(
      () =>
        parsePensionCredential({
          "@context": ["https://www.w3.org/2018/credentials/v1"],
          id: "urn:authbound:pension-credential:test",
          type: ["VerifiableCredential", "PensionCredential"],
          credentialSubject: {
            Person: {
              given_name: "Test",
              family_name: "Person",
              birth_date: "1973-09-31",
              personal_administrative_number: "010973-999Y",
            },
            Pension: {
              typeCode: "TKEL",
              typeName: "Pysyvä työkyvyttömyyseläke",
              startDate: "2024-02-01",
            },
          },
        }),
      /invalid date field: birth_date/
    );
  });

  it("does not fetch signed results for unknown verification ids", async () => {
    const getResult = mockFunction(async (_verificationId: string) =>
      signedResult("vrf_leaked")
    );
    const app = createApp({
      createClient: () => createMockClient({ verifications: { getResult } }),
    });

    await withAppServer(app, async (baseUrl) => {
      const response = await fetch(`${baseUrl}/result?id=vrf_leaked`);

      assert.equal(response.status, 404);
      assert.equal(getResult.calls.length, 0);
    });
  });

  it("does not fetch signed results before verification is verified", async () => {
    process.env.AUTHBOUND_PUBLISHABLE_KEY = "pk_test_123";
    const create = mockFunction(async () =>
      verification({
        id: "vrf_pending",
        status: "created",
        clientToken: "client_token_123",
        expiresAt: "2999-01-01T00:00:00.000Z",
        clientAction: {
          kind: "qr",
          data: "openid4vp://authorize?request_uri=https%3A%2F%2Fexample.test",
        },
      })
    );
    const getStatus = mockFunction(async () =>
      verificationStatus({ id: "vrf_pending", status: "verified" })
    );
    const getResult = mockFunction(async (verificationId: string) =>
      signedResult(verificationId)
    );

    const app = createApp({
      createClient: () =>
        createMockClient({
          verifications: { create, getStatus, getResult },
        }),
    });

    await withAppServer(app, async (baseUrl) => {
      const createResponse = await fetch(`${baseUrl}/verify`, {
        method: "POST",
      });
      assert.equal(createResponse.ok, true);

      const earlyResultResponse = await fetch(
        `${baseUrl}/result?id=vrf_pending`
      );
      assert.equal(earlyResultResponse.status, 409);
      assert.equal(getResult.calls.length, 0);

      const statusResponse = await fetch(`${baseUrl}/status?id=vrf_pending`);
      assert.equal(statusResponse.ok, true);

      const verifiedResultResponse = await fetch(
        `${baseUrl}/result?id=vrf_pending`
      );
      assert.equal(verifiedResultResponse.ok, true);
      assert.equal(getResult.calls.length, 1);
    });
  });

  it("expires verification sessions from Authbound's expiresAt value", async () => {
    process.env.AUTHBOUND_PUBLISHABLE_KEY = "pk_test_123";
    const create = mockFunction(async () =>
      verification({
        id: "vrf_expired",
        status: "created",
        clientToken: "client_token_123",
        expiresAt: "2000-01-01T00:00:00.000Z",
        clientAction: {
          kind: "qr",
          data: "openid4vp://authorize?request_uri=https%3A%2F%2Fexample.test",
        },
      })
    );
    const getStatus = mockFunction(async () =>
      verificationStatus({ id: "vrf_expired", status: "created" })
    );

    const app = createApp({
      createClient: () =>
        createMockClient({ verifications: { create, getStatus } }),
    });

    await withAppServer(app, async (baseUrl) => {
      const createResponse = await fetch(`${baseUrl}/verify`, {
        method: "POST",
      });
      assert.equal(createResponse.ok, true);

      const statusResponse = await fetch(`${baseUrl}/status?id=vrf_expired`);

      assert.equal(statusResponse.status, 404);
      assert.equal(getStatus.calls.length, 0);
    });
  });
});
