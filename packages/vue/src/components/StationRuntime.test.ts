// @vitest-environment happy-dom

import { afterEach, describe, expect, it, vi } from "vitest";
import { createApp, defineComponent, h, nextTick, ref } from "vue";
import {
  StationEntry,
  StationEntryDisplay,
  StationOperatorConsole,
} from "./StationRuntime";

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

async function waitForExpectation(assertion: () => void): Promise<void> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try {
      assertion();
      return;
    } catch (error) {
      lastError = error;
      await nextTick();
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  }
  throw lastError;
}

describe("StationOperatorConsole", () => {
  afterEach(() => {
    vi.useRealTimers();
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
          data: "{\"request_uri\":\"https://verifier.example/request.jwt/req_dc_api\"}",
          expires_at: "2026-06-07T12:10:00.000Z",
        },
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    const host = document.createElement("div");
    const app = createApp(StationEntry, {
      entryToken: "entry_123",
      gatewayBaseUrl: "https://api.authbound.test",
      stationId: "stn_123",
    });
    app.mount(host);

    host.querySelector("button")?.dispatchEvent(new MouseEvent("click"));

    await waitForExpectation(() => {
      expect(fetchMock).toHaveBeenCalled();
      expect(host.querySelector("a")).toBeNull();
    });

    app.unmount();
  });

  it("requests entry token refresh only for StationEntryDisplay", async () => {
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
    vi.stubGlobal("EventSource", undefined);

    const host = document.createElement("div");
    const app = createApp(StationEntryDisplay, {
      displayToken: "display_123",
      runtimeBaseUrl: "https://app.test",
      runtimeMode: "proxy",
      stationId: "stn_123",
    });
    try {
      app.mount(host);

      await waitForExpectation(() => {
        expect(fetchMock).toHaveBeenCalled();
      });

      expect(String(fetchMock.mock.calls[0]?.[0])).toBe(
        "https://app.test/api/authbound/stations/stn_123/display?token=display_123&refresh_entry_token=true"
      );
    } finally {
      app.unmount();
    }
  });

  it("refreshes StationEntryDisplay before the entry token expires", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-07T12:00:00.000Z"));
    const refreshedStation = {
      ...station,
      entry: {
        entry_url:
          "https://tenant.test/verify/stations/stn_123?token=entry_456",
        qr_payload:
          "https://tenant.test/verify/stations/stn_123?token=entry_456&transport=qr",
        nfc_payload:
          "https://tenant.test/verify/stations/stn_123?token=entry_456&transport=nfc",
        token_expires_at: "2026-06-07T12:20:00.000Z",
      },
    } as const;
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input));
      if (url.pathname.endsWith("/display")) {
        return Response.json({
          object: "station_display",
          station:
            fetchMock.mock.calls.length === 1 ? station : refreshedStation,
          verifications: [],
        });
      }
      throw new Error(`Unexpected fetch: ${url.toString()}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("EventSource", undefined);

    const host = document.createElement("div");
    const app = createApp(StationEntryDisplay, {
      displayToken: "display_123",
      runtimeBaseUrl: "https://app.test",
      runtimeMode: "proxy",
      stationId: "stn_123",
    });
    app.mount(host);
    await nextTick();
    await Promise.resolve();
    await nextTick();

    expect(fetchMock).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(9 * 60 * 1000 + 5 * 1000);
    await nextTick();

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[1]?.[0])).toBe(
      "https://app.test/api/authbound/stations/stn_123/display?token=display_123&refresh_entry_token=true"
    );

    app.unmount();
  });

  it("retries StationEntryDisplay when the first refresh request fails", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-07T12:00:00.000Z"));
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input));
      if (url.pathname.endsWith("/display")) {
        if (fetchMock.mock.calls.length === 1) {
          return Response.json(
            { object: "error", code: "conflict", message: "Refresh conflict" },
            { status: 409 }
          );
        }
        return Response.json({
          object: "station_display",
          station,
          verifications: [],
        });
      }
      throw new Error(`Unexpected fetch: ${url.toString()}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("EventSource", undefined);

    const host = document.createElement("div");
    const app = createApp(StationEntryDisplay, {
      displayToken: "display_123",
      runtimeBaseUrl: "https://app.test",
      runtimeMode: "proxy",
      stationId: "stn_123",
    });
    app.mount(host);
    await nextTick();
    await Promise.resolve();
    await nextTick();

    expect(fetchMock).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(5000);
    await nextTick();

    expect(fetchMock).toHaveBeenCalledTimes(2);

    app.unmount();
  });

  it("reads protected disclosure with an operator grant token", async () => {
    const fetchMock = vi.fn(
      async (input: RequestInfo | URL, _init?: RequestInit) => {
        const url = new URL(String(input));
        if (url.pathname.endsWith("/operator")) {
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
              portrait: "_9j_2wBD",
            },
            granted_at: "2026-06-07T12:03:00.000Z",
            expires_at: "2999-06-08T00:00:00.000Z",
          });
        }

        throw new Error(`Unexpected fetch: ${url.toString()}`);
      }
    );
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("EventSource", undefined);

    const Host = defineComponent({
      name: "StationOperatorConsoleHost",
      setup() {
        return () =>
          h(StationOperatorConsole, {
            gatewayBaseUrl: "https://api.authbound.test",
            grantToken: "grant_123",
            stationId: "stn_123",
          });
      },
    });

    const host = document.createElement("div");
    const app = createApp(Host);
    app.mount(host);

    await waitForExpectation(() => {
      expect(host.textContent).toContain("Erika");
    });
    expect(host.querySelector("img")?.getAttribute("src")).toBe(
      "data:image/jpeg;base64,/9j/2wBD"
    );
    expect(fetchMock.mock.calls.map(([input]) => String(input))).toContain(
      "https://api.authbound.test/v1/stations/public/stn_123/operator"
    );
    expect(fetchMock.mock.calls.map(([input]) => String(input))).toContain(
      "https://api.authbound.test/v1/stations/public/stn_123/verifications/vrf_123/disclosure"
    );
    const disclosureCall = fetchMock.mock.calls.find(([input]) =>
      String(input).endsWith("/disclosure")
    );
    expect(disclosureCall?.[1]).toMatchObject({
      headers: {
        "X-Authbound-Station-Operator-Grant-Token": "grant_123",
      },
    });

    app.unmount();
  });

  it("removes grant-protected details when the operator grant is removed", async () => {
    const fetchMock = vi.fn(
      async (input: RequestInfo | URL, _init?: RequestInit) => {
        const url = new URL(String(input));
        if (url.pathname.endsWith("/operator")) {
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
            },
            granted_at: "2026-06-07T12:03:00.000Z",
            expires_at: "2999-06-08T00:00:00.000Z",
          });
        }

        throw new Error(`Unexpected fetch: ${url.toString()}`);
      }
    );
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("EventSource", undefined);

    let clearGrantToken: (() => void) | undefined;
    const Host = defineComponent({
      name: "StationOperatorConsoleGrantRemovalHost",
      setup() {
        const grantToken = ref<string | undefined>("grant_123");
        clearGrantToken = () => {
          grantToken.value = undefined;
        };

        return () =>
          h(StationOperatorConsole, {
            gatewayBaseUrl: "https://api.authbound.test",
            grantToken: grantToken.value,
            stationId: "stn_123",
          });
      },
    });

    const host = document.createElement("div");
    const app = createApp(Host);
    app.mount(host);

    await waitForExpectation(() => {
      expect(host.textContent).toContain("Erika");
    });

    clearGrantToken?.();
    await nextTick();

    await waitForExpectation(() => {
      expect(host.textContent).not.toContain("Erika");
      expect(host.textContent).toContain(
        "Protected identity details require an operator device grant."
      );
    });

    app.unmount();
  });
});
