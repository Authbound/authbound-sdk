import { afterEach, describe, expect, it, vi } from "vitest";
import {
  AUTHBOUND_API_VERSION,
  AUTHBOUND_CONTRACT_REVISION,
} from "../generated/api-contract";
import { AuthboundClient, getVerificationStatus } from "./client";

const apiKey = `sk_test_${"x".repeat(32)}`;
const publishableKey = `pk_test_${"x".repeat(32)}`;
const apiUrl = "https://api.example.com";

describe("AuthboundClient contract version headers", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("sends the generated API version and contract revision on Gateway requests", async () => {
    const fetchMock = vi.fn(async () =>
      Response.json({
        object: "list",
        data: [],
        has_more: false,
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    await new AuthboundClient({ apiKey, apiUrl }).verifications.list();

    const [, request] = fetchMock.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(request.headers).toMatchObject({
      "Authbound-Api-Version": AUTHBOUND_API_VERSION,
      "Authbound-Contract-Revision": AUTHBOUND_CONTRACT_REVISION,
    });
  });

  it("sends generated contract headers from standalone status helpers", async () => {
    const fetchMock = vi.fn(async () =>
      Response.json({
        object: "verification_status",
        id: "vrf_123",
        status: "verified",
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    await getVerificationStatus({
      apiUrl,
      verificationId: "vrf_123",
      clientToken: "client_token_123",
      publishableKey,
    });

    const [, request] = fetchMock.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(request.headers).toMatchObject({
      "Authbound-Api-Version": AUTHBOUND_API_VERSION,
      "Authbound-Contract-Revision": AUTHBOUND_CONTRACT_REVISION,
      Authorization: "Bearer client_token_123",
      "X-Authbound-Publishable-Key": publishableKey,
    });
  });

  it("sends generated contract headers when publishing a credential definition", async () => {
    const fetchMock = vi.fn(async () =>
      Response.json({
        object: "issuer.credential_definition",
        id: "employee_badge_v2",
        credentialDefinitionId: "employee_badge_v2",
        vct: "urn:vc:authbound:employee-badge:2.0",
        format: "dc+sd-jwt",
        title: "Employee Badge v2",
        claims: [],
        aliases: [],
        lifecycleStatus: "published",
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    await new AuthboundClient({
      apiKey,
      apiUrl,
    }).issuer.credentialDefinitions.publish("employee_badge_v2");

    const [, request] = fetchMock.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(request.headers).toMatchObject({
      "Authbound-Api-Version": AUTHBOUND_API_VERSION,
      "Authbound-Contract-Revision": AUTHBOUND_CONTRACT_REVISION,
    });
  });
});
