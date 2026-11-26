import { format, inspect } from "node:util";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  AuthboundClient,
  type AuthboundClientConfig,
  AuthboundClientError,
  getVerificationStatus,
} from "./client";
import { createHandlerClient } from "./handler-kernel";
import {
  generateWebhookSignature,
  verifyWebhookSignatureDetailed,
} from "./webhooks";

const apiKey = `sk_test_${"k".repeat(32)}`;
const publishableKey = `pk_test_${"p".repeat(32)}`;

function thrownBy(run: () => unknown): unknown {
  try {
    run();
  } catch (error) {
    return error;
  }
  throw new Error("expected a throw");
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("apiUrl", () => {
  it("is required, because a key works only on the host that issued it", () => {
    const error = thrownBy(
      () => new AuthboundClient({ apiKey } as unknown as AuthboundClientConfig)
    );
    expect(error).toBeInstanceOf(AuthboundClientError);
    expect(error).toMatchObject({ code: "MISSING_API_URL" });
    expect((error as Error).message).toContain("AUTHBOUND_API_URL");
  });

  it("must be an absolute http(s) URL", () => {
    for (const apiUrl of ["sandbox.example.com", "ftp://api.example.com"]) {
      expect(
        thrownBy(() => new AuthboundClient({ apiKey, apiUrl }))
      ).toMatchObject({ code: "INVALID_API_URL" });
    }
  });

  it("drops a trailing slash", async () => {
    const fetchMock = vi.fn(async (_input: string | URL | Request) =>
      Response.json({ object: "list", data: [] })
    );
    vi.stubGlobal("fetch", fetchMock);

    const client = new AuthboundClient({
      apiKey,
      apiUrl: "https://api.example.com/",
    });
    await client.issuer.credentialDefinitions.list();

    expect(client.getApiUrl()).toBe("https://api.example.com");
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      "https://api.example.com/v1/issuer/credential-definitions"
    );
  });

  it("is required by the standalone status helper", async () => {
    await expect(
      getVerificationStatus({
        verificationId: "vrf_123",
        clientToken: "client_token_123",
        publishableKey,
      } as unknown as Parameters<typeof getVerificationStatus>[0])
    ).rejects.toMatchObject({ code: "MISSING_API_URL" });
  });

  it("falls back to AUTHBOUND_API_URL in framework handlers, and fails without it", () => {
    vi.stubEnv("AUTHBOUND_API_URL", "");
    expect(thrownBy(() => createHandlerClient({ apiKey }))).toMatchObject({
      code: "MISSING_API_URL",
    });

    vi.stubEnv("AUTHBOUND_API_URL", "https://env.example.com");
    expect(createHandlerClient({ apiKey }).getApiUrl()).toBe(
      "https://env.example.com"
    );
    expect(
      createHandlerClient({
        apiKey,
        apiUrl: "https://config.example.com",
      }).getApiUrl()
    ).toBe("https://config.example.com");
  });
});

describe("secret key", () => {
  it("stays out of logs, inspection and JSON", () => {
    const client = new AuthboundClient({
      apiKey,
      apiUrl: "https://api.example.com",
    });

    expect(inspect(client, { depth: 10, showHidden: true })).not.toContain(
      apiKey
    );
    expect(format("%o", client)).not.toContain(apiKey);
    expect(JSON.stringify(client)).toBe(
      JSON.stringify({ apiUrl: "https://api.example.com" })
    );
    expect(JSON.stringify({ client })).not.toContain(apiKey);
    expect(Object.values(client)).not.toContain(apiKey);
  });

  it("stays out of the errors a failed request throws", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              object: "error",
              code: "invalid_api_key",
              message: "Invalid API key",
            }),
            { status: 401, headers: { "Content-Type": "application/json" } }
          )
      )
    );
    const client = new AuthboundClient({
      apiKey,
      apiUrl: "https://api.example.com",
    });

    const error = await client.verifications
      .get("vrf_123")
      .catch((caught: unknown) => caught);
    expect(error).toMatchObject({ code: "invalid_api_key", statusCode: 401 });
    expect(inspect(error, { depth: 10 })).not.toContain(apiKey);
    expect(JSON.stringify(error)).not.toContain(apiKey);
  });
});

describe("API errors", () => {
  it("carry the API's param and request ID, and no SDK debug fields", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              object: "error",
              code: "validation_error",
              message: "Invalid request parameters",
              param: "return_url",
            }),
            {
              status: 400,
              headers: {
                "Content-Type": "application/json",
                "x-request-id": "req_123",
              },
            }
          )
      )
    );
    const client = new AuthboundClient({
      apiKey,
      apiUrl: "https://api.example.com",
    });

    const error = await client.verifications
      .create({ policyId: "pol_identity_basic_eudi_v1" })
      .catch((caught: unknown) => caught);
    expect(error).toMatchObject({
      code: "validation_error",
      param: "return_url",
      requestId: "req_123",
      details: undefined,
    });
  });
});

describe("network failures", () => {
  it("surface as NETWORK_ERROR naming the host, with the cause", async () => {
    const cause = new TypeError("fetch failed", {
      cause: new Error("getaddrinfo ENOTFOUND api.example.com"),
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw cause;
      })
    );
    const client = new AuthboundClient({
      apiKey,
      apiUrl: "https://api.example.com",
    });

    const error = await client.verifications
      .get("vrf_123")
      .catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(AuthboundClientError);
    expect(error).toMatchObject({ code: "NETWORK_ERROR", cause });
    expect((error as Error).message).toContain("https://api.example.com");
    expect((error as Error).message).toContain("ENOTFOUND");

    await expect(
      getVerificationStatus({
        apiUrl: "https://api.example.com",
        verificationId: "vrf_123",
        clientToken: "client_token_123",
        publishableKey,
      })
    ).rejects.toMatchObject({ code: "NETWORK_ERROR" });
  });
});

describe("webhook signature failures", () => {
  const secret = "whsec_test_secret";
  const rawBody = '{"id":"evt_1","type":"verification.completed"}';

  it("hint at the raw body when the body was re-serialized", () => {
    const { signature } = generateWebhookSignature({
      payload: rawBody,
      secret,
    });
    const reserialized = JSON.stringify(JSON.parse(rawBody), null, 2);

    const result = verifyWebhookSignatureDetailed({
      payload: reserialized,
      signature,
      secret,
    });
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/raw request body/);
  });

  it("refuse a parsed body", () => {
    const { signature } = generateWebhookSignature({
      payload: rawBody,
      secret,
    });

    const result = verifyWebhookSignatureDetailed({
      payload: JSON.parse(rawBody) as unknown as string,
      signature,
      secret,
    });
    expect(result).toMatchObject({ valid: false });
    expect(result.error).toMatch(/not parsed JSON/);
  });
});
