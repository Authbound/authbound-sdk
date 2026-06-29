// @vitest-environment happy-dom

import { act, renderHook } from "@testing-library/react";
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
          kind: "dc_api",
          data: '{"request_uri":"https://verifier.example/request.jwt/req_dc_api"}',
          expires_at: "2026-06-07T12:10:00.000Z",
        },
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() =>
      useStationEntry({
        gatewayBaseUrl: "https://api.authbound.test",
        stationId: "stn_123",
        entryToken: "entry_token_123",
        clientRef: "client_ref_123",
        transport: "qr",
      })
    );

    let spawn: Awaited<ReturnType<typeof result.current.start>> | undefined;
    await act(async () => {
      spawn = await result.current.start();
    });

    expect(spawn).toMatchObject({
      object: "station_spawn",
      station_id: "stn_123",
      verification_id: "vrf_123",
      client_action: {
        kind: "dc_api",
      },
    });
    expect(result.current.spawn?.verification_id).toBe("vrf_123");
    const [url, init] = fetchMock.mock.calls[0] as unknown as [
      URL,
      RequestInit,
    ];
    expect(url.toString()).toBe(
      "https://api.authbound.test/v1/stations/public/stn_123/verifications?token=entry_token_123"
    );
    expect(init.method).toBe("POST");
    expect(JSON.parse(String(init.body))).toEqual({
      client_ref: "client_ref_123",
      transport: "qr",
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

    const { result } = renderHook(() =>
      useStationEntry({
        runtimeBaseUrl: "https://app.test",
        runtimeMode: "proxy",
        stationId: "stn_123",
        entryToken: "entry_token_123",
        clientRef: "client_ref_123",
      })
    );

    await act(async () => {
      await result.current.start();
    });

    const [url] = fetchMock.mock.calls[0] as unknown as [RequestInfo | URL];
    expect(String(url)).toBe(
      "https://app.test/api/authbound/stations/stn_123/entry?token=entry_token_123"
    );
  });
});
