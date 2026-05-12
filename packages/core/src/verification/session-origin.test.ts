import { describe, expect, it } from "vitest";

import {
  isSameOriginSessionRequest,
  originForStatusProxy,
  publicRequestOrigin,
} from "./session-origin";

function request(
  url: string,
  headers: Record<string, string> = {}
): { url: string; headers: Headers } {
  return { url, headers: new Headers(headers) };
}

describe("session origin helpers", () => {
  it("ignores forwarded headers by default when validating same-origin requests", () => {
    const input = request("http://internal:3000/api/authbound/session", {
      origin: "https://playground.authbound.io",
      "sec-fetch-site": "same-origin",
      "x-forwarded-proto": "https",
      "x-forwarded-host": "playground.authbound.io",
    });

    expect(publicRequestOrigin(input)).toBe("http://internal:3000");
    expect(isSameOriginSessionRequest(input)).toBe(false);
    expect(originForStatusProxy(input)).toBe("https://playground.authbound.io");
  });

  it("accepts a proxied same-origin request when proxy trust is enabled", () => {
    const input = request("http://internal:3000/api/authbound/session", {
      origin: "https://playground.authbound.io",
      "sec-fetch-site": "same-origin",
      "x-forwarded-proto": "https",
      "x-forwarded-host": "playground.authbound.io",
    });

    expect(publicRequestOrigin(input, { trustProxy: true })).toBe(
      "https://playground.authbound.io"
    );
    expect(isSameOriginSessionRequest(input, { trustProxy: true })).toBe(true);
    expect(originForStatusProxy(input, { trustProxy: true })).toBe(
      "https://playground.authbound.io"
    );
  });

  it("uses forwarded headers for origin fallback only when proxy trust is enabled", () => {
    const input = request("http://internal:3000/api/authbound/session", {
      "x-forwarded-proto": "https",
      "x-forwarded-host": "playground.authbound.io",
    });

    expect(originForStatusProxy(input)).toBe("http://internal:3000");
    expect(originForStatusProxy(input, { trustProxy: true })).toBe(
      "https://playground.authbound.io"
    );
  });

  it("does not trust a framework-normalized https request URL when forwarded headers are present", () => {
    const input = request("https://app.example.com/api/authbound/session", {
      host: "app.example.com",
      origin: "https://app.example.com",
      "sec-fetch-site": "same-origin",
      "x-forwarded-proto": "https",
    });

    expect(publicRequestOrigin(input)).toBe("http://app.example.com");
    expect(isSameOriginSessionRequest(input)).toBe(false);
    expect(isSameOriginSessionRequest(input, { trustProxy: true })).toBe(true);
  });

  it("uses x-forwarded-proto with the host header when proxy trust is enabled", () => {
    const input = request("http://internal:3000/api/authbound/session", {
      host: "playground.authbound.io",
      origin: "https://playground.authbound.io",
      "sec-fetch-site": "same-origin",
      "x-forwarded-proto": "https",
    });

    expect(publicRequestOrigin(input, { trustProxy: true })).toBe(
      "https://playground.authbound.io"
    );
    expect(isSameOriginSessionRequest(input, { trustProxy: true })).toBe(true);
  });

  it("does not trust a framework-normalized https request URL without a host header", () => {
    const input = request("https://app.example.com/api/authbound/session", {
      origin: "https://app.example.com",
      "sec-fetch-site": "same-origin",
      "x-forwarded-proto": "https",
    });

    expect(publicRequestOrigin(input)).toBe("http://app.example.com");
    expect(isSameOriginSessionRequest(input)).toBe(false);
  });

  it("accepts an explicit allowed origin when request URL is internal", () => {
    const input = request("http://internal:3000/api/authbound/session", {
      origin: "https://playground.authbound.io",
      "sec-fetch-site": "same-origin",
    });

    expect(
      isSameOriginSessionRequest(input, {
        allowedOrigins: ["https://playground.authbound.io"],
      })
    ).toBe(true);
  });

  it("rejects origins outside the explicit allowlist", () => {
    const input = request("http://internal:3000/api/authbound/session", {
      origin: "https://attacker.example",
      "sec-fetch-site": "same-origin",
    });

    expect(
      isSameOriginSessionRequest(input, {
        allowedOrigins: ["https://playground.authbound.io"],
      })
    ).toBe(false);
  });

  it("rejects cross-site browser requests even when the origin is allowlisted", () => {
    const input = request("http://internal:3000/api/authbound/session", {
      origin: "https://playground.authbound.io",
      "sec-fetch-site": "cross-site",
    });

    expect(
      isSameOriginSessionRequest(input, {
        allowedOrigins: ["https://playground.authbound.io"],
      })
    ).toBe(false);
  });

  it("rejects session finalization without an Origin header", () => {
    expect(
      isSameOriginSessionRequest(
        request("http://internal:3000/api/authbound/session")
      )
    ).toBe(false);
  });
});
