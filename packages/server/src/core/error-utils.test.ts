import { describe, expect, it } from "vitest";
import { sanitizeError } from "./error-utils";

describe("error sanitization", () => {
  it("redacts secret-bearing object keys from debug error causes", () => {
    const leakedClientToken = "debug_client_token_secret";
    const leakedOfferUri =
      "openid-credential-offer://issuer.example.test/offer?credential_offer_uri=https%3A%2F%2Fissuer.example.test%2Fsecret";
    const error = new Error("Gateway request failed", {
      cause: {
        [`clientToken=${leakedClientToken}`]: "client token metadata",
        [leakedOfferUri]: "credential offer metadata",
        nested: {
          [`preAuthorizedCode=${leakedClientToken}`]: "offer metadata",
        },
      },
    });

    const serialized = JSON.stringify(sanitizeError(error, true));

    expect(serialized).not.toContain(leakedClientToken);
    expect(serialized).not.toContain(leakedOfferUri);
    expect(serialized).toContain("[redacted]");
  });

  it("redacts opaque values stored under sensitive debug keys", () => {
    const leakedClientToken = "alpha.12345";
    const leakedAuthorization = "beta.67890";
    const leakedApiKey = "gamma.54321";
    const error = new Error("Gateway request failed", {
      cause: {
        clientToken: leakedClientToken,
        authorization: leakedAuthorization,
        nested: {
          apiKey: leakedApiKey,
        },
      },
    });

    const serialized = JSON.stringify(sanitizeError(error, true));

    expect(serialized).not.toContain(leakedClientToken);
    expect(serialized).not.toContain(leakedAuthorization);
    expect(serialized).not.toContain(leakedApiKey);
    expect(serialized).not.toContain("clientToken");
    expect(serialized).not.toContain("authorization");
    expect(serialized).not.toContain("apiKey");
    expect(serialized).toContain("[redacted]");
  });

  it("redacts opaque values stored under camelCase token debug keys", () => {
    const leakedAccessToken = "access.12345";
    const leakedRefreshToken = "refresh.67890";
    const leakedIdToken = "id.54321";
    const leakedAuthToken = "auth.09876";
    const error = new Error("Gateway request failed", {
      cause: {
        accessToken: leakedAccessToken,
        refreshToken: leakedRefreshToken,
        nested: {
          idToken: leakedIdToken,
          authToken: leakedAuthToken,
        },
      },
    });

    const serialized = JSON.stringify(sanitizeError(error, true));

    expect(serialized).not.toContain(leakedAccessToken);
    expect(serialized).not.toContain(leakedRefreshToken);
    expect(serialized).not.toContain(leakedIdToken);
    expect(serialized).not.toContain(leakedAuthToken);
    expect(serialized).not.toContain("accessToken");
    expect(serialized).not.toContain("refreshToken");
    expect(serialized).not.toContain("idToken");
    expect(serialized).not.toContain("authToken");
    expect(serialized).toContain("[redacted]");
  });
});
