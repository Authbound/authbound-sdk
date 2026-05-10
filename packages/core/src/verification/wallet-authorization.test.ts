import { describe, expect, it } from "vitest";
import { resolveWalletAuthorizationRequest } from "./wallet-authorization";

describe("resolveWalletAuthorizationRequest", () => {
  it("uses QR client_action data before the browser verification_url", () => {
    const result = resolveWalletAuthorizationRequest({
      verification_url:
        "https://ab-1k2rbz6f9ab5p6xj.authbound.io/v/c525499e-1310-4dd8-bb91-3d6be3a45fbc",
      client_action: {
        kind: "qr",
        data: "eudi-openid4vp://?client_id=https%3A%2F%2Feudi-verifier.authbound.io&request_uri=https%3A%2F%2Feudi-verifier.authbound.io%2Fwallet%2Frequest.jwt%2Fabc",
      },
    });

    expect(result).toEqual({
      authorizationRequestUrl:
        "eudi-openid4vp://?client_id=https%3A%2F%2Feudi-verifier.authbound.io&request_uri=https%3A%2F%2Feudi-verifier.authbound.io%2Fwallet%2Frequest.jwt%2Fabc",
      deepLink:
        "eudi-openid4vp://?client_id=https%3A%2F%2Feudi-verifier.authbound.io&request_uri=https%3A%2F%2Feudi-verifier.authbound.io%2Fwallet%2Frequest.jwt%2Fabc",
    });
  });

  it("does not let a browser authorizationRequestUrl override QR client_action data", () => {
    const result = resolveWalletAuthorizationRequest({
      authorizationRequestUrl:
        "https://ab-1k2rbz6f9ab5p6xj.authbound.io/v/c525499e-1310-4dd8-bb91-3d6be3a45fbc",
      client_action: {
        kind: "qr",
        data: "eudi-openid4vp://?client_id=https%3A%2F%2Feudi-verifier.authbound.io&request_uri=https%3A%2F%2Feudi-verifier.authbound.io%2Fwallet%2Frequest.jwt%2Fabc",
      },
    });

    expect(result.authorizationRequestUrl).toBe(
      "eudi-openid4vp://?client_id=https%3A%2F%2Feudi-verifier.authbound.io&request_uri=https%3A%2F%2Feudi-verifier.authbound.io%2Fwallet%2Frequest.jwt%2Fabc"
    );
  });

  it("uses explicit authorizationRequestUrl when it is already a wallet invocation URL", () => {
    const result = resolveWalletAuthorizationRequest({
      authorizationRequestUrl:
        "openid4vp://?request_uri=https%3A%2F%2Fapi.authbound.io%2Frequest%2F123",
      client_action: {
        kind: "qr",
        data: "eudi-openid4vp://?client_id=https%3A%2F%2Feudi-verifier.authbound.io&request_uri=https%3A%2F%2Feudi-verifier.authbound.io%2Fwallet%2Frequest.jwt%2Fabc",
      },
    });

    expect(result.authorizationRequestUrl).toBe(
      "openid4vp://?request_uri=https%3A%2F%2Fapi.authbound.io%2Frequest%2F123"
    );
  });

  it("uses link client_action data", () => {
    const result = resolveWalletAuthorizationRequest({
      client_action: {
        kind: "link",
        data: "openid4vp://?request_uri=https%3A%2F%2Fapi.authbound.io%2Frequest%2F123",
      },
    });

    expect(result.authorizationRequestUrl).toBe(
      "openid4vp://?request_uri=https%3A%2F%2Fapi.authbound.io%2Frequest%2F123"
    );
    expect(result.deepLink).toBe(
      "openid4vp://?request_uri=https%3A%2F%2Fapi.authbound.io%2Frequest%2F123"
    );
  });

  it("uses URL-shaped request_blob data", () => {
    const result = resolveWalletAuthorizationRequest({
      client_action: {
        kind: "request_blob",
        data: "eudi-openid4vp://?client_id=https%3A%2F%2Feudi-verifier.authbound.io&request=eyJ0eXAiOiJvcGVuaWQ0dnAifQ",
      },
    });

    expect(result.authorizationRequestUrl).toBe(
      "eudi-openid4vp://?client_id=https%3A%2F%2Feudi-verifier.authbound.io&request=eyJ0eXAiOiJvcGVuaWQ0dnAifQ"
    );
  });

  it("uses HTTPS wallet request_uri payloads", () => {
    const result = resolveWalletAuthorizationRequest({
      client_action: {
        kind: "qr",
        data: "https://wallet.example/authorize?request_uri=https%3A%2F%2Fapi.authbound.io%2Frequest%2F123",
      },
    });

    expect(result.authorizationRequestUrl).toBe(
      "https://wallet.example/authorize?request_uri=https%3A%2F%2Fapi.authbound.io%2Frequest%2F123"
    );
  });

  it("rejects non-wallet URL schemes from client_action data", () => {
    for (const data of [
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAA",
      "javascript:alert(1)",
      "file:///tmp/request.jwt",
      "notopenid4vp-wallet://?request_uri=https%3A%2F%2Fapi.authbound.io%2Frequest%2F123",
    ]) {
      const result = resolveWalletAuthorizationRequest({
        client_action: {
          kind: "qr",
          data,
        },
      });

      expect(result.authorizationRequestUrl).toBeUndefined();
      expect(result.deepLink).toBeUndefined();
    }
  });

  it("ignores non-URL request_blob data without another wallet URL", () => {
    const result = resolveWalletAuthorizationRequest({
      client_action: {
        kind: "request_blob",
        data: "eyJ0eXAiOiJvcGVuaWQ0dnAifQ",
      },
    });

    expect(result.authorizationRequestUrl).toBeUndefined();
    expect(result.deepLink).toBeUndefined();
  });

  it("does not use verification_url as a wallet invocation fallback", () => {
    const result = resolveWalletAuthorizationRequest({
      verification_url:
        "openid4vp://?request_uri=https%3A%2F%2Fapi.authbound.io%2Frequest%2F123",
    });

    expect(result.authorizationRequestUrl).toBeUndefined();
  });

  it("does not treat a browser verification_url as a wallet QR payload", () => {
    const result = resolveWalletAuthorizationRequest({
      verification_url:
        "https://ab-1k2rbz6f9ab5p6xj.authbound.io/v/c525499e-1310-4dd8-bb91-3d6be3a45fbc",
    });

    expect(result.authorizationRequestUrl).toBeUndefined();
  });

  it("does not treat verification_url with only client_id as a wallet QR payload", () => {
    const result = resolveWalletAuthorizationRequest({
      verification_url: "https://app.example/verify?client_id=abc",
    });

    expect(result.authorizationRequestUrl).toBeUndefined();
  });
});
