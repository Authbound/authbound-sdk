import type { PolicyId } from "@authbound/core";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createStationEntryRoute, createVerification } from "../server";

const verificationResponse = {
  object: "verification",
  id: "vrf_1234567890abcdef",
  client_token: "client_token_value",
  client_action: {
    kind: "link",
    data: "openid4vp://authorize?request_uri=https%3A%2F%2Fwallet.example%2Fr",
    expires_at: "2026-03-09T12:00:00.000Z",
  },
  expires_at: "2026-03-09T12:00:00.000Z",
};

function stubFetch() {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => verificationResponse,
  });
  global.fetch = fetchMock as typeof fetch;
  return fetchMock;
}

describe("Next.js default API host", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it.each([
    ["sk_test_secret", "https://sandbox.authbound.io"],
    ["sk_live_secret", "https://edge.authbound.io"],
  ])("creates verifications for %s on %s", async (secret, host) => {
    vi.stubEnv("AUTHBOUND_API_URL", "");
    const fetchMock = stubFetch();

    await createVerification({
      policyId: "pol_age_over_18_authbound_v1" as PolicyId,
      secret,
    });

    expect(fetchMock.mock.calls[0]?.[0]).toBe(`${host}/v1/verifications`);
  });

  it("prefers AUTHBOUND_API_URL over the key's host", async () => {
    vi.stubEnv("AUTHBOUND_API_URL", "https://gateway.example.com");
    const fetchMock = stubFetch();

    await createVerification({
      policyId: "pol_age_over_18_authbound_v1" as PolicyId,
      secret: "sk_live_secret",
    });

    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      "https://gateway.example.com/v1/verifications"
    );
  });

  it("requires AUTHBOUND_API_URL or a secret key for station routes", () => {
    vi.stubEnv("AUTHBOUND_API_URL", "");
    vi.stubEnv("AUTHBOUND_SECRET_KEY", "");

    expect(() => createStationEntryRoute()).toThrow(
      "Missing required environment variable: AUTHBOUND_API_URL or AUTHBOUND_SECRET_KEY"
    );
  });
});
