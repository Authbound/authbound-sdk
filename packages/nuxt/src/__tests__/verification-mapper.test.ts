import { describe, expect, it } from "vitest";
import { mapGatewayVerificationResponse } from "../runtime/server/api/verification-mapper";

describe("mapGatewayVerificationResponse", () => {
  it("uses QR client_action data before the browser verification_url", () => {
    expect(
      mapGatewayVerificationResponse({
        id: "vrf_123",
        client_token: "client_token_123",
        verification_url:
          "https://ab-1k2rbz6f9ab5p6xj.authbound.io/v/vrf_123",
        client_action: {
          kind: "qr",
          data: "eudi-openid4vp://?client_id=https%3A%2F%2Feudi-verifier.authbound.io&request_uri=https%3A%2F%2Feudi-verifier.authbound.io%2Fwallet%2Frequest.jwt%2Fabc",
        },
        expires_at: "2026-03-09T12:00:00.000Z",
      })
    ).toEqual({
      verificationId: "vrf_123",
      authorizationRequestUrl:
        "eudi-openid4vp://?client_id=https%3A%2F%2Feudi-verifier.authbound.io&request_uri=https%3A%2F%2Feudi-verifier.authbound.io%2Fwallet%2Frequest.jwt%2Fabc",
      clientToken: "client_token_123",
      expiresAt: "2026-03-09T12:00:00.000Z",
      deepLink:
        "eudi-openid4vp://?client_id=https%3A%2F%2Feudi-verifier.authbound.io&request_uri=https%3A%2F%2Feudi-verifier.authbound.io%2Fwallet%2Frequest.jwt%2Fabc",
    });
  });

  it("throws when the response has no wallet invocation URL", () => {
    expect(() =>
      mapGatewayVerificationResponse({
        id: "vrf_123",
        client_token: "client_token_123",
        client_action: {
          kind: "request_blob",
          data: "eyJ0eXAiOiJvcGVuaWQ0dnAtcmVxdWVzdCJ9",
        },
        expires_at: "2026-03-09T12:00:00.000Z",
      })
    ).toThrow(
      "Authbound did not return a wallet invocation URL for this verification."
    );
  });
});
