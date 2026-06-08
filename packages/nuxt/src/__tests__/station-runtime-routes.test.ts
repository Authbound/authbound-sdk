import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const runtimeConfig = vi.hoisted(() => ({
  current: {
    authbound: {},
    public: { authbound: {} },
  },
}));

vi.mock("nitropack/runtime", () => ({
  useRuntimeConfig: () => runtimeConfig.current,
}));

import stationDisclosureHandler from "../runtime/server/api/station-disclosure";
import stationDisplayHandler from "../runtime/server/api/station-display";
import stationDisplayEventsHandler from "../runtime/server/api/station-display-events";
import stationEntryHandler from "../runtime/server/api/station-entry";

function createEvent(options: {
  method: string;
  path: string;
  params: Record<string, string>;
  body?: unknown;
  headers?: Record<string, string>;
}) {
  const responseHeaders = new Headers();
  return {
    _requestBody: options.body ? JSON.stringify(options.body) : undefined,
    context: { params: options.params },
    handled: false,
    method: options.method,
    path: options.path,
    responseHeaders,
    node: {
      req: {
        connection: {},
        headers: {
          "content-type": "application/json",
          ...options.headers,
        },
        method: options.method,
        originalUrl: options.path,
        url: options.path,
      },
      res: {
        setHeader: (
          name: string,
          value: string | number | readonly string[]
        ) => {
          responseHeaders.set(
            name,
            Array.isArray(value) ? value.join(", ") : String(value)
          );
        },
      },
    },
  };
}

describe("Nuxt station runtime routes", () => {
  const originalApiUrl = process.env.AUTHBOUND_API_URL;

  beforeEach(() => {
    vi.restoreAllMocks();
    runtimeConfig.current = {
      authbound: {},
      public: { authbound: { debug: false } },
    };
    process.env.AUTHBOUND_API_URL = "https://api.authbound.test";
  });

  afterEach(() => {
    process.env.AUTHBOUND_API_URL = originalApiUrl;
  });

  it("proxies station entry without a project secret", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => ({
        object: "station_spawn",
        station_id: "stn_demo",
        verification_id: "vrf_demo",
      }),
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    await expect(
      stationEntryHandler(
        createEvent({
          method: "POST",
          path: "/api/authbound/stations/stn_demo/entry?token=entry_token",
          params: { stationId: "stn_demo" },
          body: { client_ref: "client_ref_123", transport: "qr" },
        }) as never
      )
    ).resolves.toMatchObject({ object: "station_spawn" });

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.authbound.test/v1/stations/public/stn_demo/verifications?token=entry_token",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ client_ref: "client_ref_123", transport: "qr" }),
      }
    );
  });

  it("proxies display and disclosure reads", async () => {
    const fetchMock = vi
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
      });
    global.fetch = fetchMock as unknown as typeof fetch;

    const displayEvent = createEvent({
      method: "GET",
      path: "/api/authbound/stations/stn_demo/display?token=display_token",
      params: { stationId: "stn_demo" },
    });
    const disclosureEvent = createEvent({
      method: "GET",
      path: "/api/authbound/stations/stn_demo/verifications/vrf_demo/disclosure",
      params: { stationId: "stn_demo", verificationId: "vrf_demo" },
      headers: {
        "X-Authbound-Station-Display-Token": "display_token",
        "X-Authbound-Station-Operator-Grant-Token": "grant_token",
      },
    });

    await stationDisplayHandler(displayEvent as never);
    await stationDisclosureHandler(disclosureEvent as never);

    expect(displayEvent.responseHeaders.get("cache-control")).toBe("no-store");
    expect(displayEvent.responseHeaders.get("referrer-policy")).toBe(
      "no-referrer"
    );
    expect(displayEvent.responseHeaders.get("x-content-type-options")).toBe(
      "nosniff"
    );
    expect(disclosureEvent.responseHeaders.get("cache-control")).toBe(
      "no-store"
    );
    expect(disclosureEvent.responseHeaders.get("referrer-policy")).toBe(
      "no-referrer"
    );
    expect(disclosureEvent.responseHeaders.get("x-content-type-options")).toBe(
      "nosniff"
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "https://api.authbound.test/v1/stations/public/stn_demo/display?token=display_token",
      { method: "GET" }
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
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

  it("redacts token-bearing upstream station errors before returning them", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({
        object: "error",
        code: "invalid_display_token",
        message:
          "display_token=display_secret grant_token=grant_secret entry_token=entry_secret",
      }),
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    await expect(
      stationDisplayHandler(
        createEvent({
          method: "GET",
          path: "/api/authbound/stations/stn_demo/display?token=display_secret",
          params: { stationId: "stn_demo" },
        }) as never
      )
    ).rejects.toMatchObject({
      statusCode: 401,
      message: expect.stringContaining("[redacted]"),
    });

    await stationDisplayHandler(
      createEvent({
        method: "GET",
        path: "/api/authbound/stations/stn_demo/display?token=display_secret",
        params: { stationId: "stn_demo" },
      }) as never
    ).catch((error) => {
      const serialized = JSON.stringify(error);
      expect(serialized).not.toContain("display_secret");
      expect(serialized).not.toContain("grant_secret");
      expect(serialized).not.toContain("entry_secret");
    });
  });

  it("rejects disclosure tokens in the query string", async () => {
    const fetchMock = vi.fn();
    global.fetch = fetchMock as unknown as typeof fetch;

    await expect(
      stationDisclosureHandler(
        createEvent({
          method: "GET",
          path: "/api/authbound/stations/stn_demo/verifications/vrf_demo/disclosure?display_token=display_token&grant_token=grant_token",
          params: { stationId: "stn_demo", verificationId: "vrf_demo" },
        }) as never
      )
    ).rejects.toMatchObject({
      statusCode: 400,
      message: "X-Authbound-Station-Display-Token is required",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("proxies station display event streams", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      body: new ReadableStream(),
      headers: new Headers({
        "content-type": "text/event-stream; charset=utf-8",
        "cache-control": "no-store",
      }),
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    const response = await stationDisplayEventsHandler(
      createEvent({
        method: "GET",
        path: "/api/authbound/stations/stn_demo/display/events/sse?token=display_token",
        params: { stationId: "stn_demo" },
      }) as never
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe(
      "text/event-stream; charset=utf-8"
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.authbound.test/v1/stations/public/stn_demo/display/events/sse?token=display_token",
      { method: "GET" }
    );
  });

  it("forwards station display event replay cursors", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      body: new ReadableStream(),
      headers: new Headers({
        "content-type": "text/event-stream; charset=utf-8",
      }),
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    await stationDisplayEventsHandler(
      createEvent({
        method: "GET",
        path: "/api/authbound/stations/stn_demo/display/events/sse?token=display_token&after=41",
        params: { stationId: "stn_demo" },
        headers: { "last-event-id": "42" },
      }) as never
    );

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.authbound.test/v1/stations/public/stn_demo/display/events/sse?token=display_token&after=41",
      { method: "GET", headers: { "Last-Event-ID": "42" } }
    );
  });
});
