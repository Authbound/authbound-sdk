// @vitest-environment happy-dom

import {
  act,
  render,
  renderHook,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { StationOperatorConsole } from "../components/station-runtime";
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
            expires_at: "2026-06-08T00:00:00.000Z",
          });
        }

        throw new Error(`Unexpected fetch: ${url.toString()}`);
      }
    );
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() =>
      useStationOperatorFeed({
        gatewayBaseUrl: "https://api.authbound.test",
        stationId: "stn_123",
        displayToken: "display_123",
        grantToken: "grant_123",
        connectEvents: false,
      })
    );

    await waitFor(() => {
      expect(result.current.display?.station.id).toBe("stn_123");
    });
    expect(result.current.verifications[0]?.assertions).toEqual({
      age_over_18: true,
      ticket_valid: true,
    });

    let disclosure:
      | Awaited<ReturnType<typeof result.current.readDisclosure>>
      | undefined;
    await act(async () => {
      disclosure = await result.current.readDisclosure("vrf_123");
    });

    expect(disclosure?.fields).toMatchObject({
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
    const fetchMock = vi.fn(
      async (input: RequestInfo | URL, _init?: RequestInit) => {
        const url = new URL(String(input));
        if (url.pathname.endsWith("/display")) {
          return Response.json({
            object: "station_display",
            station,
            verifications: [],
          });
        }
        throw new Error(`Unexpected fetch: ${url.toString()}`);
      }
    );
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("EventSource", FakeEventSource);

    const { result } = renderHook(() =>
      useStationOperatorFeed({
        runtimeBaseUrl: "https://app.test",
        runtimeMode: "proxy",
        stationId: "stn_123",
        displayToken: "display_123",
      })
    );

    await waitFor(() => {
      expect(result.current.display?.station.id).toBe("stn_123");
    });
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe(
      "https://app.test/api/authbound/stations/stn_123/display?token=display_123"
    );
    expect(FakeEventSource.instances[0]?.url).toBe(
      "https://app.test/api/authbound/stations/stn_123/display/events/sse?token=display_123"
    );

    await act(async () => {
      FakeEventSource.instances[0]?.emit("station.verification.completed", {
        station_id: "stn_123",
        verification_id: "vrf_live",
        status: "verified",
        transport: "qr",
        assertions: { age_over_18: true, ticket_valid: true },
      });
    });

    expect(result.current.verifications[0]).toMatchObject({
      verification_id: "vrf_live",
      assertions: { age_over_18: true, ticket_valid: true },
    });
  });

  it("keeps display events that arrive before the first display snapshot", async () => {
    let resolveDisplay!: (response: Response) => void;
    const displayPromise = new Promise<Response>((resolve) => {
      resolveDisplay = resolve;
    });
    const fetchMock = vi.fn(async () => displayPromise);
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("EventSource", FakeEventSource);

    const { result } = renderHook(() =>
      useStationOperatorFeed({
        runtimeBaseUrl: "https://app.test",
        runtimeMode: "proxy",
        stationId: "stn_123",
        displayToken: "display_123",
      })
    );

    await waitFor(() => {
      expect(FakeEventSource.instances).toHaveLength(1);
    });

    await act(async () => {
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
      await displayPromise;
    });

    await waitFor(() => {
      expect(result.current.verifications[0]).toMatchObject({
        verification_id: "vrf_race",
        status: "verified",
        assertions: { age_over_18: true },
      });
    });
  });

  it("renders grant-protected disclosure details in the operator console", async () => {
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
                assertions: { age_over_18: true, ticket_valid: true },
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
            },
            granted_at: "2026-06-07T12:03:00.000Z",
            expires_at: "2026-06-08T00:00:00.000Z",
          });
        }

        throw new Error(`Unexpected fetch: ${url.toString()}`);
      }
    );
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("EventSource", FakeEventSource);

    render(
      <StationOperatorConsole
        displayToken="display_123"
        grantToken="grant_123"
        runtimeBaseUrl="https://app.test"
        runtimeMode="proxy"
        stationId="stn_123"
      />
    );

    await waitFor(() => {
      expect(screen.getByText("Erika")).toBeTruthy();
    });
    expect(fetchMock.mock.calls.map(([input]) => String(input))).toContain(
      "https://app.test/api/authbound/stations/stn_123/verifications/vrf_123/disclosure"
    );
    const disclosureCall = fetchMock.mock.calls.find(([input]) =>
      String(input).endsWith("/disclosure")
    );
    expect(disclosureCall?.[1]).toMatchObject({
      headers: {
        "X-Authbound-Station-Display-Token": "display_123",
        "X-Authbound-Station-Operator-Grant-Token": "grant_123",
      },
    });
  });
});
