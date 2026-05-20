import { afterEach, describe, expect, it, vi } from "vitest";
import { createClient } from "../factory";

describe("createClient", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("sends the publishable key when polling verification status", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          status: "processing",
          result: {
            verified: true,
            attributes: { birth_date: "1990-05-15" },
          },
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
      gatewayUrl: "https://gateway.authbound.test",
    });

    await expect(
      client.pollStatus("vrf_test123" as never, "client_token_123" as never)
    ).resolves.toEqual({
      status: "processing",
    });

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

  it("projects public polling statuses to browser UI statuses", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            object: "verification_status",
            id: "vrf_test123",
            status: "awaiting_user",
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }
        )
      )
    );

    const client = createClient({
      publishableKey: "pk_test_public123" as never,
      gatewayUrl: "https://gateway.authbound.test",
    });

    await expect(
      client.pollStatus("vrf_test123" as never, "client_token_123" as never)
    ).resolves.toEqual({
      status: "pending",
    });
  });

  it("falls back to polling immediately when realtime SSE is unavailable", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            object: "error",
            code: "realtime_unavailable",
            message: "Realtime verification events are temporarily unavailable",
          }),
          {
            status: 503,
            headers: { "Content-Type": "application/json" },
          }
        )
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            object: "verification_status",
            id: "vrf_test123",
            status: "verified",
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
      gatewayUrl: "https://gateway.authbound.test",
    });
    const events: unknown[] = [];

    const cleanup = client.subscribeToStatus(
      "vrf_test123" as never,
      "client_token_123" as never,
      (event) => events.push(event)
    );

    await vi.waitFor(() => {
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

    expect(events).toContainEqual(
      expect.objectContaining({
        status: "verified",
        type: "status",
      })
    );

    cleanup();
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

  it("accepts opaque request_blob QR payloads from the configured verification endpoint", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            verificationId: "vrf_test123",
            authorizationRequestUrl: "eyJ0eXAiOiJvcGVuaWQ0dnAifQ",
            clientToken: "client_token_123",
            expiresAt: "2026-04-21T10:10:00.000Z",
            walletHandoffKind: "request_blob",
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }
        )
      )
    );

    const client = createClient({
      publishableKey: "pk_test_public123" as never,
      policyId: "pol_authbound_pension_v1" as never,
      verificationEndpoint: "/api/authbound/verification",
    });

    await expect(client.startVerification()).resolves.toMatchObject({
      verificationId: "vrf_test123",
      authorizationRequestUrl: "eyJ0eXAiOiJvcGVuaWQ0dnAifQ",
      walletHandoffKind: "request_blob",
    });
  });

  it("finalizes a verified browser session through the configured session endpoint", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          isVerified: true,
          verificationId: "vrf_test123",
          status: "verified",
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
      sessionEndpoint: "/api/authbound/session",
    });

    await expect(
      client.finalizeVerification(
        "vrf_test123" as never,
        "client_token_123" as never
      )
    ).resolves.toEqual({
      isVerified: true,
      verificationId: "vrf_test123",
      status: "verified",
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/authbound/session",
      expect.objectContaining({
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          verificationId: "vrf_test123",
          clientToken: "client_token_123",
        }),
      })
    );
  });

  it("sends arbitrary JSON metadata through the configured verification endpoint", async () => {
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

    const metadata = {
      cart_total: 42,
      checks: ["age", "identity"],
      nested: { tier: "gold" },
    };

    await client.startVerification({ metadata });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/authbound/verification",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          policyId: "pol_authbound_pension_v1",
          metadata,
        }),
      })
    );
  });
});
