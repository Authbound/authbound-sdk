import { describe, expect, it } from "vitest";
import {
  resolveWalletAuthorizationRequest,
  resolveWalletHandoff,
} from "./wallet-authorization";

describe("resolveWalletAuthorizationRequest", () => {
  it("returns a first-class wallet handoff that keeps hosted URLs separate", () => {
    const result = resolveWalletHandoff({
      verification_url:
        "https://ab-1k2rbz6f9ab5p6xj.authbound.io/v/c525499e-1310-4dd8-bb91-3d6be3a45fbc",
      client_action: {
        kind: "qr",
        data: "eudi-openid4vp://?client_id=https%3A%2F%2Feudi-verifier.authbound.io&request_uri=https%3A%2F%2Feudi-verifier.authbound.io%2Fwallet%2Frequest.jwt%2Fabc",
        expires_at: "2026-05-15T10:00:00.000Z",
      },
    });

    expect(result).toEqual({
      kind: "qr",
      walletInvocationUrl:
        "eudi-openid4vp://?client_id=https%3A%2F%2Feudi-verifier.authbound.io&request_uri=https%3A%2F%2Feudi-verifier.authbound.io%2Fwallet%2Frequest.jwt%2Fabc",
      qrPayload:
        "eudi-openid4vp://?client_id=https%3A%2F%2Feudi-verifier.authbound.io&request_uri=https%3A%2F%2Feudi-verifier.authbound.io%2Fwallet%2Frequest.jwt%2Fabc",
      deepLink:
        "eudi-openid4vp://?client_id=https%3A%2F%2Feudi-verifier.authbound.io&request_uri=https%3A%2F%2Feudi-verifier.authbound.io%2Fwallet%2Frequest.jwt%2Fabc",
      hostedVerificationUrl:
        "https://ab-1k2rbz6f9ab5p6xj.authbound.io/v/c525499e-1310-4dd8-bb91-3d6be3a45fbc",
      expiresAt: "2026-05-15T10:00:00.000Z",
    });
  });

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

  it("uses explicit deepLink when it is already a wallet invocation URL", () => {
    const result = resolveWalletAuthorizationRequest({
      deepLink:
        "openid4vp://authorize?request_uri=https%3A%2F%2Fapi.authbound.io%2Frequest%2F123",
      client_action: {
        kind: "qr",
        data: "eudi-openid4vp://?request_uri=https%3A%2F%2Fapi.authbound.io%2Frequest%2Fabc",
      },
    });

    expect(result.authorizationRequestUrl).toBe(
      "eudi-openid4vp://?request_uri=https%3A%2F%2Fapi.authbound.io%2Frequest%2Fabc"
    );
    expect(result.deepLink).toBe(
      "openid4vp://authorize?request_uri=https%3A%2F%2Fapi.authbound.io%2Frequest%2F123"
    );
  });

  it("does not use hosted URLs as explicit deep links", () => {
    const result = resolveWalletAuthorizationRequest({
      deepLink: "https://ab-demo.authbound.io/v/vrf_test123",
      client_action: {
        kind: "qr",
        data: "openid4vp://authorize?request_uri=https%3A%2F%2Fapi.authbound.io%2Frequest%2F123",
      },
    });

    expect(result.deepLink).toBe(
      "openid4vp://authorize?request_uri=https%3A%2F%2Fapi.authbound.io%2Frequest%2F123"
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
    expect(result.deepLink).toBeUndefined();
  });

  it("uses URL-shaped request_blob data as QR payload without making it a deep link", () => {
    const handoff = resolveWalletHandoff({
      client_action: {
        kind: "request_blob",
        data: "eudi-openid4vp://?client_id=https%3A%2F%2Feudi-verifier.authbound.io&request=eyJ0eXAiOiJvcGVuaWQ0dnAifQ",
      },
    });

    expect(handoff).toEqual({
      kind: "request_blob",
      qrPayload:
        "eudi-openid4vp://?client_id=https%3A%2F%2Feudi-verifier.authbound.io&request=eyJ0eXAiOiJvcGVuaWQ0dnAifQ",
    });
  });

  it("uses URL-shaped request_blob data that is not a wallet invocation URL as QR payload", () => {
    const handoff = resolveWalletHandoff({
      client_action: {
        kind: "request_blob",
        data: "https://wallet.example/request.jwt",
      },
    });

    expect(handoff).toEqual({
      kind: "request_blob",
      qrPayload: "https://wallet.example/request.jwt",
    });

    const result = resolveWalletAuthorizationRequest({
      client_action: {
        kind: "request_blob",
        data: "https://wallet.example/request.jwt",
      },
    });

    expect(result.authorizationRequestUrl).toBe(
      "https://wallet.example/request.jwt"
    );
    expect(result.deepLink).toBeUndefined();
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

  it("uses opaque request_blob data as QR payload without treating it as a deep link", () => {
    const handoff = resolveWalletHandoff({
      client_action: {
        kind: "request_blob",
        data: "eyJ0eXAiOiJvcGVuaWQ0dnAifQ",
      },
    });

    expect(handoff).toEqual({
      kind: "request_blob",
      qrPayload: "eyJ0eXAiOiJvcGVuaWQ0dnAifQ",
    });

    const result = resolveWalletAuthorizationRequest({
      client_action: {
        kind: "request_blob",
        data: "eyJ0eXAiOiJvcGVuaWQ0dnAifQ",
      },
    });

    expect(result.authorizationRequestUrl).toBe("eyJ0eXAiOiJvcGVuaWQ0dnAifQ");
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
