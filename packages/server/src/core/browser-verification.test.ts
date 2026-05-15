import { describe, expect, it } from "vitest";
import { toBrowserVerificationResponse } from "./browser-verification";

describe("browser verification handler kernel", () => {
  it("maps wallet handoff from client_action and keeps hosted verification URLs out of QR payloads", () => {
    const response = toBrowserVerificationResponse({
      id: "vrf_test123",
      clientToken: "client_token_123",
      expiresAt: "2026-05-15T10:00:00.000Z",
      verificationUrl: "https://ab-demo.authbound.io/v/vrf_test123",
      clientAction: {
        kind: "qr",
        data: "openid4vp://authorize?request_uri=https%3A%2F%2Fapi.authbound.test%2Frequest%2F123",
        expiresAt: "2026-05-15T10:00:00.000Z",
      },
    });

    expect(response).toEqual({
      verificationId: "vrf_test123",
      authorizationRequestUrl:
        "openid4vp://authorize?request_uri=https%3A%2F%2Fapi.authbound.test%2Frequest%2F123",
      clientToken: "client_token_123",
      expiresAt: "2026-05-15T10:00:00.000Z",
      deepLink:
        "openid4vp://authorize?request_uri=https%3A%2F%2Fapi.authbound.test%2Frequest%2F123",
    });
  });

  it("accepts first-class wallet URLs from framework mappers", () => {
    const response = toBrowserVerificationResponse({
      id: "vrf_test123",
      authorizationRequestUrl:
        "openid4vp://authorize?request_uri=https%3A%2F%2Fapi.authbound.test%2Frequest%2F123",
      deepLink:
        "openid4vp://authorize?request_uri=https%3A%2F%2Fapi.authbound.test%2Frequest%2F123",
      clientToken: "client_token_123",
      expiresAt: "2026-05-15T10:00:00.000Z",
      verificationUrl: "https://ab-demo.authbound.io/v/vrf_test123",
    });

    expect(response).toEqual({
      verificationId: "vrf_test123",
      authorizationRequestUrl:
        "openid4vp://authorize?request_uri=https%3A%2F%2Fapi.authbound.test%2Frequest%2F123",
      clientToken: "client_token_123",
      expiresAt: "2026-05-15T10:00:00.000Z",
      deepLink:
        "openid4vp://authorize?request_uri=https%3A%2F%2Fapi.authbound.test%2Frequest%2F123",
    });
  });

  it("rejects browser responses that only contain a hosted verification URL", () => {
    expect(() =>
      toBrowserVerificationResponse({
        id: "vrf_test123",
        clientToken: "client_token_123",
        expiresAt: "2026-05-15T10:00:00.000Z",
        verificationUrl: "https://ab-demo.authbound.io/v/vrf_test123",
      })
    ).toThrow("wallet invocation URL");
  });
});
