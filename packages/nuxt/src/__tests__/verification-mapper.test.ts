import { describe, expect, it } from "vitest";
import { mapGatewayVerificationResponse } from "../runtime/server/api/verification-mapper";

describe("mapGatewayVerificationResponse", () => {
  it("uses verification_url when client_action is QR data", () => {
    expect(
      mapGatewayVerificationResponse({
        id: "vrf_123",
        client_token: "client_token_123",
        verification_url:
          "openid4vp://authorize?request_uri=https%3A%2F%2Fapi.authbound.io%2Frequest%2F123",
        client_action: {
          kind: "qr",
          data: "iVBORw0KGgoAAAANSUhEUgAA",
        },
        expires_at: "2026-03-09T12:00:00.000Z",
      })
    ).toEqual({
      verificationId: "vrf_123",
      authorizationRequestUrl:
        "openid4vp://authorize?request_uri=https%3A%2F%2Fapi.authbound.io%2Frequest%2F123",
      clientToken: "client_token_123",
      expiresAt: "2026-03-09T12:00:00.000Z",
      deepLink: undefined,
    });
  });

  it("throws when the response has no browser-compatible wallet URL", () => {
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
      "Authbound did not return a browser-compatible wallet URL for this verification."
    );
  });
});
