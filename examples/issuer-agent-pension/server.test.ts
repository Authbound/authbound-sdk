import assert from "node:assert/strict";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, it } from "node:test";
import type { PensionExampleClient } from "./pension-flow.ts";
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

function createMockClient(options: {
  verifications?: Partial<PensionExampleClient["verifications"]>;
}): PensionExampleClient {
  return {
    issuer: {
      credentialDefinitions: {
        get: async (credentialDefinitionId) => ({ credentialDefinitionId }),
        create: async ({ credentialDefinitionId }) => ({
          credentialDefinitionId,
        }),
      },
    },
    openId4Vc: {
      issuance: {
        createOffer: async () => ({
          id: "offer_test",
          offerUri: "openid-credential-offer://example.test",
        }),
      },
    },
    verifications: {
      create: async () => ({
        id: "vrf_test",
        status: "pending",
      }),
      getStatus: async () => ({
        status: "pending",
      }),
      getResult: async (verificationId) => ({
        verificationId,
        status: "verified",
        resultToken: "result_token",
      }),
      ...options.verifications,
    },
  };
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
    const getResult = mockFunction(async (_verificationId: string) => ({
      verificationId: "vrf_leaked",
      status: "verified",
      resultToken: "result_token",
    }));
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
    const create = mockFunction(async () => ({
      id: "vrf_pending",
      status: "pending",
      clientToken: "client_token_123",
      expiresAt: "2999-01-01T00:00:00.000Z",
      clientAction: {
        kind: "qr",
        data: "openid4vp://authorize?request_uri=https%3A%2F%2Fexample.test",
      },
    }));
    const getStatus = mockFunction(async () => ({
      object: "verification_status",
      id: "vrf_pending",
      status: "verified",
    }));
    const getResult = mockFunction(async (verificationId: string) => ({
      verificationId,
      status: "verified",
      resultToken: "result_token",
    }));

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
    const create = mockFunction(async () => ({
      id: "vrf_expired",
      status: "pending",
      clientToken: "client_token_123",
      expiresAt: "2000-01-01T00:00:00.000Z",
      clientAction: {
        kind: "qr",
        data: "openid4vp://authorize?request_uri=https%3A%2F%2Fexample.test",
      },
    }));
    const getStatus = mockFunction(async () => ({
      object: "verification_status",
      id: "vrf_expired",
      status: "pending",
    }));

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
