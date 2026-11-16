import { describe, expect, it } from "vitest";
import { defaultApiUrl } from "./api-url";
import { resolveConfig } from "./client/config";
import { buildStationEntryUrl } from "./station-runtime";

const suffix = "x".repeat(32);

describe("defaultApiUrl", () => {
  it.each([
    [`sk_test_${suffix}`, "https://sandbox.authbound.io"],
    [`pk_test_${suffix}`, "https://sandbox.authbound.io"],
    [`sk_live_${suffix}`, "https://edge.authbound.io"],
    [`pk_live_${suffix}`, "https://edge.authbound.io"],
  ])("sends %s to %s", (key, host) => {
    expect(defaultApiUrl(key)).toBe(host);
  });
});

describe("resolveConfig gatewayUrl", () => {
  it("picks the host from the publishable key", () => {
    expect(
      resolveConfig({ publishableKey: `pk_test_${suffix}` }).gatewayUrl
    ).toBe("https://sandbox.authbound.io");
    expect(
      resolveConfig({ publishableKey: `pk_live_${suffix}` }).gatewayUrl
    ).toBe("https://edge.authbound.io");
  });

  it("keeps an explicit gatewayUrl", () => {
    expect(
      resolveConfig({
        publishableKey: `pk_live_${suffix}`,
        gatewayUrl: "https://gateway.example.com",
      }).gatewayUrl
    ).toBe("https://gateway.example.com");
  });
});

describe("station runtime URLs", () => {
  it("requires baseUrl in direct mode", () => {
    expect(() =>
      buildStationEntryUrl({ stationId: "stn_123", token: "entry_token" })
    ).toThrow(expect.objectContaining({ code: "config_invalid" }));
  });

  it("builds relative proxy URLs without baseUrl", () => {
    expect(
      buildStationEntryUrl({
        mode: "proxy",
        stationId: "stn_123",
        token: "entry_token",
      })
    ).toBe("/api/authbound/stations/stn_123/entry?token=entry_token");
  });
});
