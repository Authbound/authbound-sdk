import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createStationDisclosureRoute,
  createStationDisplayEventsRoute,
  createStationDisplayRoute,
  createStationEntryRoute,
} from "../server";

describe("Next.js station runtime routes", () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("proxies station entry without sending a project secret", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => ({
        object: "station_spawn",
        station_id: "stn_demo",
        verification_id: "vrf_demo",
      }),
    });
    global.fetch = fetchMock as typeof fetch;

    const handler = createStationEntryRoute({
      gatewayUrl: "https://api.authbound.test",
    });
    const response = await handler(
      new Request(
        "https://app.test/api/stations/stn_demo/entry?token=entry_token",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            client_ref: "client_ref_123",
            transport: "qr",
          }),
        }
      ),
      { params: { stationId: "stn_demo" } }
    );

    expect(response.status).toBe(201);
    expect(global.fetch).toHaveBeenCalledWith(
      "https://api.authbound.test/v1/stations/public/stn_demo/verifications?token=entry_token",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ client_ref: "client_ref_123", transport: "qr" }),
      }
    );
    expect(fetchMock.mock.calls[0]?.[1]?.headers).not.toHaveProperty(
      "X-Authbound-Key"
    );
  });

  it("proxies display feed and grant-protected disclosure reads", async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ object: "station_display" }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          object: "station_verification_disclosure",
          fields: { given_name: "Ada" },
        }),
      }) as typeof fetch;

    const displayHandler = createStationDisplayRoute({
      gatewayUrl: "https://api.authbound.test",
    });
    const disclosureHandler = createStationDisclosureRoute({
      gatewayUrl: "https://api.authbound.test",
    });

    const displayResponse = await displayHandler(
      new Request(
        "https://app.test/api/stations/stn_demo/display?token=display_token"
      ),
      { params: { stationId: "stn_demo" } }
    );
    const disclosureResponse = await disclosureHandler(
      new Request(
        "https://app.test/api/stations/stn_demo/verifications/vrf_demo/disclosure",
        {
          headers: {
            "X-Authbound-Station-Display-Token": "display_token",
            "X-Authbound-Station-Operator-Grant-Token": "grant_token",
          },
        }
      ),
      { params: { stationId: "stn_demo", verificationId: "vrf_demo" } }
    );

    expect(displayResponse.headers.get("cache-control")).toBe("no-store");
    expect(displayResponse.headers.get("referrer-policy")).toBe("no-referrer");
    expect(displayResponse.headers.get("x-content-type-options")).toBe(
      "nosniff"
    );
    expect(disclosureResponse.headers.get("cache-control")).toBe("no-store");
    expect(disclosureResponse.headers.get("referrer-policy")).toBe(
      "no-referrer"
    );
    expect(disclosureResponse.headers.get("x-content-type-options")).toBe(
      "nosniff"
    );
    expect(global.fetch).toHaveBeenNthCalledWith(
      1,
      "https://api.authbound.test/v1/stations/public/stn_demo/display?token=display_token",
      { method: "GET" }
    );
    expect(global.fetch).toHaveBeenNthCalledWith(
      2,
      "https://api.authbound.test/v1/stations/public/stn_demo/verifications/vrf_demo/disclosure",
      {
        method: "GET",
        headers: {
          "X-Authbound-Station-Display-Token": "display_token",
          "X-Authbound-Station-Operator-Grant-Token": "grant_token",
        },
      }
    );
  });

  it("forwards explicit station entry-token refresh requests", async () => {
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ object: "station_display" }),
    }) as typeof fetch;

    const displayHandler = createStationDisplayRoute({
      gatewayUrl: "https://api.authbound.test",
    });

    await displayHandler(
      new Request(
        "https://app.test/api/stations/stn_demo/display?token=display_token&refresh_entry_token=true"
      ),
      { params: { stationId: "stn_demo" } }
    );

    expect(global.fetch).toHaveBeenCalledWith(
      "https://api.authbound.test/v1/stations/public/stn_demo/display?token=display_token&refresh_entry_token=true",
      { method: "GET" }
    );
  });

  it("redacts token-bearing upstream station errors before returning them", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({
        object: "error",
        code: "invalid_display_token",
        message:
          "display_token=display_secret grant_token=grant_secret entry_token=entry_secret",
      }),
    }) as typeof fetch;

    const handler = createStationDisplayRoute({
      gatewayUrl: "https://api.authbound.test",
    });
    const response = await handler(
      new Request(
        "https://app.test/api/stations/stn_demo/display?token=display_secret"
      ),
      { params: { stationId: "stn_demo" } }
    );
    const body = await response.json();
    const serialized = JSON.stringify(body);

    expect(response.status).toBe(401);
    expect(serialized).not.toContain("display_secret");
    expect(serialized).not.toContain("grant_secret");
    expect(serialized).not.toContain("entry_secret");
    expect(serialized).toContain("[redacted]");
  });

  it("rejects disclosure tokens in the query string", async () => {
    const fetchMock = vi.fn();
    global.fetch = fetchMock as typeof fetch;

    const handler = createStationDisclosureRoute({
      gatewayUrl: "https://api.authbound.test",
    });
    const response = await handler(
      new Request(
        "https://app.test/api/stations/stn_demo/verifications/vrf_demo/disclosure?display_token=display_token&grant_token=grant_token"
      ),
      { params: { stationId: "stn_demo", verificationId: "vrf_demo" } }
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error:
        "stationId, verificationId, station display token header, and operator grant token header are required",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("proxies station display event streams", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      body: new ReadableStream(),
      headers: new Headers({
        "content-type": "text/event-stream; charset=utf-8",
        "cache-control": "no-store",
      }),
    }) as typeof fetch;

    const handler = createStationDisplayEventsRoute({
      gatewayUrl: "https://api.authbound.test",
    });
    const response = await handler(
      new Request(
        "https://app.test/api/stations/stn_demo/display/events/sse?token=display_token"
      ),
      { params: { stationId: "stn_demo" } }
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe(
      "text/event-stream; charset=utf-8"
    );
    expect(global.fetch).toHaveBeenCalledWith(
      "https://api.authbound.test/v1/stations/public/stn_demo/display/events/sse?token=display_token",
      { method: "GET" }
    );
  });

  it("forwards station display event replay cursors", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      body: new ReadableStream(),
      headers: new Headers({
        "content-type": "text/event-stream; charset=utf-8",
      }),
    }) as typeof fetch;

    const handler = createStationDisplayEventsRoute({
      gatewayUrl: "https://api.authbound.test",
    });
    await handler(
      new Request(
        "https://app.test/api/stations/stn_demo/display/events/sse?token=display_token&after=41",
        { headers: { "Last-Event-ID": "42" } }
      ),
      { params: { stationId: "stn_demo" } }
    );

    expect(global.fetch).toHaveBeenCalledWith(
      "https://api.authbound.test/v1/stations/public/stn_demo/display/events/sse?token=display_token&after=41",
      { method: "GET", headers: { "Last-Event-ID": "42" } }
    );
  });
});
