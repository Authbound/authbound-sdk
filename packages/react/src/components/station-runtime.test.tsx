// @vitest-environment happy-dom

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { StationEntry } from "./station-runtime";

describe("StationEntry", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("does not render opaque dc_api station handoffs as links", async () => {
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

    render(
      <StationEntry
        entryToken="entry_123"
        gatewayBaseUrl="https://api.authbound.test"
        stationId="stn_123"
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Start verification" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalled();
      expect(screen.queryByRole("link")).toBeNull();
    });
  });
});
