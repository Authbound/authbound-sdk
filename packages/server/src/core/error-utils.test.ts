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
});
