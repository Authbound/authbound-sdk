import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createStationDisclosureRoute,
  createStationDisplayEventsRoute,
  createStationDisplayRoute,
  createStationEntryRoute,
  createStationOperatorEventsRoute,
  createStationOperatorRoute,
} from "../server";

const CONTRACT_HEADERS = {
  "Authbound-Api-Version": "v1",
  "Authbound-Contract-Revision": "v1.2026-06-18.1",
};

function fetchCall(index: number): [string, RequestInit] {
  return (
    global.fetch as unknown as { mock: { calls: [string, RequestInit][] } }
  ).mock.calls[index];
}

function gatewayHeaderValues(
  headers: HeadersInit | undefined,
  extraNames: string[] = []
) {
  const actual = new Headers(headers);
  return Object.fromEntries(
    [...Object.keys(CONTRACT_HEADERS), ...extraNames].map((name) => [
      name,
      actual.get(name),
    ])
  );
}

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
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ client_ref: "client_ref_123", transport: "qr" }),
      })
    );
    const headers = new Headers(fetchCall(0)[1].headers);
    expect(
      gatewayHeaderValues(fetchCall(0)[1].headers, ["Content-Type"])
    ).toEqual({
      ...CONTRACT_HEADERS,
      "Content-Type": "application/json",
    });
    expect(headers.has("X-Authbound-Key")).toBe(false);
  });

  it("proxies display feed, operator feed, and grant-protected disclosure reads", async () => {
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
    const operatorHandler = createStationOperatorRoute({
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
    const operatorResponse = await operatorHandler(
      new Request("https://app.test/api/stations/stn_demo/operator", {
        headers: {
          "X-Authbound-Station-Operator-Grant-Token": "grant_token",
        },
      }),
      { params: { stationId: "stn_demo" } }
    );
    const disclosureResponse = await disclosureHandler(
      new Request(
        "https://app.test/api/stations/stn_demo/verifications/vrf_demo/disclosure",
        {
          headers: {
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
    expect(operatorResponse.headers.get("cache-control")).toBe("no-store");
    expect(disclosureResponse.headers.get("cache-control")).toBe("no-store");
    expect(disclosureResponse.headers.get("referrer-policy")).toBe(
      "no-referrer"
    );
    expect(disclosureResponse.headers.get("x-content-type-options")).toBe(
      "nosniff"
    );
    expect(fetchCall(0)[0]).toBe(
      "https://api.authbound.test/v1/stations/public/stn_demo/display?token=display_token"
    );
    expect(fetchCall(0)[1].method).toBe("GET");
    expect(gatewayHeaderValues(fetchCall(0)[1].headers)).toEqual(
      CONTRACT_HEADERS
    );
    expect(fetchCall(1)[0]).toBe(
      "https://api.authbound.test/v1/stations/public/stn_demo/operator"
    );
    expect(fetchCall(1)[1].method).toBe("GET");
    expect(
      gatewayHeaderValues(fetchCall(1)[1].headers, [
        "X-Authbound-Station-Operator-Grant-Token",
      ])
    ).toEqual({
      ...CONTRACT_HEADERS,
      "X-Authbound-Station-Operator-Grant-Token": "grant_token",
    });
    expect(fetchCall(2)[0]).toBe(
      "https://api.authbound.test/v1/stations/public/stn_demo/verifications/vrf_demo/disclosure"
    );
    expect(fetchCall(2)[1].method).toBe("GET");
    expect(
      gatewayHeaderValues(fetchCall(2)[1].headers, [
        "X-Authbound-Station-Operator-Grant-Token",
      ])
    ).toEqual({
      ...CONTRACT_HEADERS,
      "X-Authbound-Station-Operator-Grant-Token": "grant_token",
    });
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
      expect.objectContaining({ method: "GET" })
    );
    expect(gatewayHeaderValues(fetchCall(0)[1].headers)).toEqual(
      CONTRACT_HEADERS
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
        "stationId, verificationId, and operator grant token header are required",
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
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("referrer-policy")).toBe("no-referrer");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(global.fetch).toHaveBeenCalledWith(
      "https://api.authbound.test/v1/stations/public/stn_demo/display/events/sse?token=display_token",
      expect.objectContaining({ method: "GET" })
    );
    expect(gatewayHeaderValues(fetchCall(0)[1].headers)).toEqual(
      CONTRACT_HEADERS
    );
  });

  it("proxies station operator event streams", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      body: new ReadableStream(),
      headers: new Headers({
        "content-type": "text/event-stream; charset=utf-8",
        "cache-control": "no-store",
      }),
    }) as typeof fetch;

    const handler = createStationOperatorEventsRoute({
      gatewayUrl: "https://api.authbound.test",
    });
    const response = await handler(
      new Request(
        "https://app.test/api/stations/stn_demo/operator/events/sse?grant_token=grant_token"
      ),
      { params: { stationId: "stn_demo" } }
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe(
      "text/event-stream; charset=utf-8"
    );
    expect(global.fetch).toHaveBeenCalledWith(
      "https://api.authbound.test/v1/stations/public/stn_demo/operator/events/sse?grant_token=grant_token",
      expect.objectContaining({ method: "GET" })
    );
    expect(gatewayHeaderValues(fetchCall(0)[1].headers)).toEqual(
      CONTRACT_HEADERS
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
      expect.objectContaining({ method: "GET" })
    );
    expect(
      gatewayHeaderValues(fetchCall(0)[1].headers, ["Last-Event-ID"])
    ).toEqual({
      ...CONTRACT_HEADERS,
      "Last-Event-ID": "42",
    });
  });
});
