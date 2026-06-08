import { afterEach, describe, expect, it, vi } from "vitest";
import { useStationEntry } from "./useStationEntry";

describe("useStationEntry", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("starts a station verification with entry token, client ref, and transport", async () => {
    const fetchMock = vi.fn(async () =>
      Response.json({
        object: "station_spawn",
        station_id: "stn_123",
        verification_id: "vrf_123",
        client_action: {
          kind: "link",
          data: "openid4vp://authorize",
          expires_at: "2026-06-07T12:10:00.000Z",
        },
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    const entry = useStationEntry({
      gatewayBaseUrl: "https://api.authbound.test",
      stationId: "stn_123",
      entryToken: "entry_token_123",
      clientRef: "client_ref_123",
      transport: "nfc",
    });

    const spawn = await entry.start();

    expect(spawn.verification_id).toBe("vrf_123");
    expect(entry.spawn.value?.verification_id).toBe("vrf_123");
    const [url, init] = fetchMock.mock.calls[0] as unknown as [
      URL,
      RequestInit,
    ];
    expect(url.toString()).toBe(
      "https://api.authbound.test/v1/stations/public/stn_123/verifications?token=entry_token_123"
    );
    expect(JSON.parse(String(init.body))).toEqual({
      client_ref: "client_ref_123",
      transport: "nfc",
    });
  });

  it("starts a station verification through an app-local proxy route", async () => {
    const fetchMock = vi.fn(async () =>
      Response.json({
        object: "station_spawn",
        station_id: "stn_123",
        verification_id: "vrf_123",
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    const entry = useStationEntry({
      runtimeBaseUrl: "https://app.test",
      runtimeMode: "proxy",
      stationId: "stn_123",
      entryToken: "entry_token_123",
      clientRef: "client_ref_123",
    });

    await entry.start();

    const [url] = fetchMock.mock.calls[0] as unknown as [RequestInfo | URL];
    expect(String(url)).toBe(
      "https://app.test/api/authbound/stations/stn_123/entry?token=entry_token_123"
    );
  });
});
