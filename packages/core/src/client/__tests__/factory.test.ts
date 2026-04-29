import { afterEach, describe, expect, it, vi } from "vitest";
import { createClient } from "../factory";

describe("createClient", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("sends the publishable key when polling verification status", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ status: "processing" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    const client = createClient({
      publishableKey: "pk_test_public123" as never,
      gatewayUrl: "https://gateway.authbound.test",
    });

    await client.pollStatus(
      "vrf_test123" as never,
      "client_token_123" as never
    );

    expect(fetchMock).toHaveBeenCalledWith(
      "https://gateway.authbound.test/v1/verifications/vrf_test123/status",
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer client_token_123",
          "x-authbound-publishable-key": "pk_test_public123",
        }),
      })
    );
  });

  it("sends provider preference through the configured verification endpoint", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          verificationId: "vrf_test123",
          authorizationRequestUrl: "https://gateway.authbound.test/request",
          clientToken: "client_token_123",
          expiresAt: "2026-04-21T10:10:00.000Z",
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }
      )
    );
    vi.stubGlobal("fetch", fetchMock);

    const client = createClient({
      publishableKey: "pk_test_public123" as never,
      policyId: "pol_authbound_pension_v1" as never,
      verificationEndpoint: "/api/authbound/verification",
    });

    await client.startVerification({ provider: "vcs" });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/authbound/verification",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          policyId: "pol_authbound_pension_v1",
          provider: "vcs",
        }),
      })
    );
  });
});
