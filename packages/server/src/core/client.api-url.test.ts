import { afterEach, describe, expect, it, vi } from "vitest";
import { AuthboundClient, getVerificationStatus } from "./client";

const suffix = "x".repeat(32);

function stubFetch() {
  const fetchMock = vi.fn(async () =>
    Response.json({ object: "list", data: [], has_more: false })
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function requestedUrl(fetchMock: ReturnType<typeof stubFetch>): string {
  const [url] = fetchMock.mock.calls[0] as unknown as [string];
  return url;
}

describe("AuthboundClient default API host", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it.each([
    [`sk_test_${suffix}`, "https://sandbox.authbound.io"],
    [`sk_live_${suffix}`, "https://edge.authbound.io"],
  ])("sends %s requests and expects result tokens from %s", async (apiKey, host) => {
    const fetchMock = stubFetch();
    const client = new AuthboundClient({ apiKey });

    await client.verifications.list();

    expect(requestedUrl(fetchMock)).toBe(`${host}/v1/verifications`);
    expect(client.resultTokenTrust().issuer).toBe(host);
  });

  it("uses an explicit apiUrl for requests and the result issuer", async () => {
    const fetchMock = stubFetch();
    const client = new AuthboundClient({
      apiKey: `sk_live_${suffix}`,
      apiUrl: "https://gateway.example.com",
    });

    await client.verifications.list();

    expect(requestedUrl(fetchMock)).toBe(
      "https://gateway.example.com/v1/verifications"
    );
    expect(client.resultTokenTrust().issuer).toBe(
      "https://gateway.example.com"
    );
  });

  it("picks the status host from the publishable key", async () => {
    const fetchMock = stubFetch();

    // The stubbed body is not a status snapshot; only the request URL matters.
    await getVerificationStatus({
      clientToken: "client_token_123",
      publishableKey: `pk_test_${suffix}`,
      verificationId: "vrf_123",
    }).catch(() => undefined);

    expect(requestedUrl(fetchMock)).toBe(
      "https://sandbox.authbound.io/v1/verifications/vrf_123/status"
    );
  });
});
