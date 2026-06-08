import { afterEach, describe, expect, it, vi } from "vitest";
import { useStationOperatorFeed } from "./useStationOperatorFeed";

const station = {
  object: "station",
  id: "stn_123",
  status: "active",
  label: "Door A",
  entry: {
    entry_url: "https://tenant.test/verify/stations/stn_123?token=entry_123",
    qr_payload:
      "https://tenant.test/verify/stations/stn_123?token=entry_123&transport=qr",
    nfc_payload:
      "https://tenant.test/verify/stations/stn_123?token=entry_123&transport=nfc",
    token_expires_at: "2026-06-07T12:10:00.000Z",
  },
  ticket: null,
} as const;

class FakeEventSource {
  static instances: FakeEventSource[] = [];
  readonly listeners = new Map<string, Array<(event: MessageEvent) => void>>();
  closed = false;

  constructor(readonly url: string) {
    FakeEventSource.instances.push(this);
  }

  addEventListener(eventName: string, listener: (event: MessageEvent) => void) {
    this.listeners.set(eventName, [
      ...(this.listeners.get(eventName) ?? []),
      listener,
    ]);
  }

  close() {
    this.closed = true;
  }

  emit(eventName: string, data: Record<string, unknown>) {
    for (const listener of this.listeners.get(eventName) ?? []) {
      listener({ data: JSON.stringify(data) } as MessageEvent);
    }
  }

  emitRaw(eventName: string, data: string) {
    for (const listener of this.listeners.get(eventName) ?? []) {
      listener({ data } as MessageEvent);
    }
  }
}

describe("useStationOperatorFeed", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    FakeEventSource.instances = [];
  });

  it("loads the token-only display and reads grant-protected disclosure", async () => {
    const fetchMock = vi.fn(
      async (input: RequestInfo | URL, _init?: RequestInit) => {
        const url = new URL(String(input));
        if (url.pathname.endsWith("/display")) {
          return Response.json({
            object: "station_display",
            station,
            verifications: [
              {
                object: "station_verification",
                station_id: "stn_123",
                verification_id: "vrf_123",
                status: "verified",
                created_at: "2026-06-07T12:01:00.000Z",
                terminal_at: "2026-06-07T12:02:00.000Z",
                transport: "qr",
                client_ref: "client_ref_123",
                failure_code: null,
                outcome_reason: null,
                assertions: {
                  age_over_18: true,
                  ticket_valid: true,
                },
              },
            ],
          });
        }

        if (url.pathname.endsWith("/disclosure")) {
          return Response.json({
            object: "station_verification_disclosure",
            station_id: "stn_123",
            verification_id: "vrf_123",
            profile: "physical_id",
            fields: {
              given_name: "Erika",
              family_name: "Mustermann",
              birth_date: "2001-08-12",
              age_over_18: true,
              ticket_valid: true,
            },
            granted_at: "2026-06-07T12:03:00.000Z",
            expires_at: "2999-06-08T00:00:00.000Z",
          });
        }

        throw new Error(`Unexpected fetch: ${url.toString()}`);
      }
    );
    vi.stubGlobal("fetch", fetchMock);

    const feed = useStationOperatorFeed({
      gatewayBaseUrl: "https://api.authbound.test",
      stationId: "stn_123",
      displayToken: "display_123",
      grantToken: "grant_123",
    });

    await feed.refresh();
    expect(feed.display.value?.station.id).toBe("stn_123");
    expect(feed.verifications.value[0]?.assertions).toEqual({
      age_over_18: true,
      ticket_valid: true,
    });

    const disclosure = await feed.readDisclosure("vrf_123");
    expect(disclosure.fields).toMatchObject({
      given_name: "Erika",
      family_name: "Mustermann",
      birth_date: "2001-08-12",
    });
    expect(fetchMock.mock.calls.map(([input]) => String(input))).toEqual([
      "https://api.authbound.test/v1/stations/public/stn_123/display?token=display_123",
      "https://api.authbound.test/v1/stations/public/stn_123/verifications/vrf_123/disclosure",
    ]);
    expect(fetchMock.mock.calls[1]?.[1]).toMatchObject({
      headers: {
        "X-Authbound-Station-Display-Token": "display_123",
        "X-Authbound-Station-Operator-Grant-Token": "grant_123",
      },
    });
  });

  it("uses proxy-mode routes and updates from station display events", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input));
      if (url.pathname.endsWith("/display")) {
        return Response.json({
          object: "station_display",
          station,
          verifications: [],
        });
      }
      throw new Error(`Unexpected fetch: ${url.toString()}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("EventSource", FakeEventSource);

    const feed = useStationOperatorFeed({
      runtimeBaseUrl: "https://app.test",
      runtimeMode: "proxy",
      stationId: "stn_123",
      displayToken: "display_123",
    });

    await feed.refresh();
    feed.connect();

    expect(String(fetchMock.mock.calls[0]?.[0])).toBe(
      "https://app.test/api/authbound/stations/stn_123/display?token=display_123"
    );
    expect(FakeEventSource.instances[0]?.url).toBe(
      "https://app.test/api/authbound/stations/stn_123/display/events/sse?token=display_123"
    );

    FakeEventSource.instances[0]?.emit("station.verification.completed", {
      station_id: "stn_123",
      verification_id: "vrf_live",
      status: "verified",
      transport: "qr",
      assertions: { age_over_18: true, ticket_valid: true },
    });

    expect(feed.verifications.value[0]).toMatchObject({
      verification_id: "vrf_live",
      assertions: { age_over_18: true, ticket_valid: true },
    });
    feed.close();
    expect(FakeEventSource.instances[0]?.closed).toBe(true);
  });

  it("ignores malformed station display events without throwing", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input));
      if (url.pathname.endsWith("/display")) {
        return Response.json({
          object: "station_display",
          station,
          verifications: [],
        });
      }
      throw new Error(`Unexpected fetch: ${url.toString()}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("EventSource", FakeEventSource);

    const feed = useStationOperatorFeed({
      runtimeBaseUrl: "https://app.test",
      runtimeMode: "proxy",
      stationId: "stn_123",
      displayToken: "display_123",
    });

    await feed.refresh();
    feed.connect();

    expect(() => {
      FakeEventSource.instances[0]?.emitRaw(
        "station.verification.completed",
        "{not-json"
      );
    }).not.toThrow();
    expect(feed.verifications.value).toEqual([]);

    feed.close();
  });

  it("keeps display events that arrive before the first display snapshot", async () => {
    let resolveDisplay!: (response: Response) => void;
    const displayPromise = new Promise<Response>((resolve) => {
      resolveDisplay = resolve;
    });
    const fetchMock = vi.fn(async () => displayPromise);
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("EventSource", FakeEventSource);

    const feed = useStationOperatorFeed({
      runtimeBaseUrl: "https://app.test",
      runtimeMode: "proxy",
      stationId: "stn_123",
      displayToken: "display_123",
    });

    const refreshPromise = feed.refresh();
    feed.connect();

    FakeEventSource.instances[0]?.emit("station.verification.created", {
      station_id: "stn_123",
      verification_id: "vrf_race",
      status: "created",
      transport: "qr",
    });
    FakeEventSource.instances[0]?.emit("station.verification.completed", {
      station_id: "stn_123",
      verification_id: "vrf_race",
      status: "verified",
      transport: "qr",
      assertions: { age_over_18: true },
    });

    resolveDisplay(
      Response.json({
        object: "station_display",
        station,
        verifications: [],
      })
    );
    await refreshPromise;

    expect(feed.verifications.value[0]).toMatchObject({
      verification_id: "vrf_race",
      status: "verified",
      assertions: { age_over_18: true },
    });
    feed.close();
  });
});
