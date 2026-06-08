import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AuthboundClient } from "./client";

const apiKey = `sk_test_${"x".repeat(32)}`;
const apiUrl = "https://api.example.com";
const stationId = "00000000-0000-4000-8000-000000000123";
const verificationId = "00000000-0000-4000-8000-000000000789";
const timestamp = "2026-06-07T12:00:00.000Z";

const stationResponse = {
  object: "station",
  id: stationId,
  project_id: "00000000-0000-4000-8000-000000000456",
  env_mode: "test",
  status: "active",
  policy_ref: "pol_station_age_ticket_v1@1",
  policy_hash: "sha256:policy",
  label: "Velvet door",
  created_at: timestamp,
  expires_at: null,
  closed_at: null,
  entry: {
    entry_url: `https://velvet.authbound.app/verify/stations/${stationId}`,
    qr_payload: `https://velvet.authbound.app/verify/stations/${stationId}?transport=qr`,
    nfc_payload: `https://velvet.authbound.app/verify/stations/${stationId}?transport=nfc`,
    token_expires_at: "2026-06-07T12:10:00.000Z",
  },
  display: {
    entry_display_url: `https://velvet.authbound.app/stations/${stationId}/display`,
    operator_console_url: `https://velvet.authbound.app/stations/${stationId}/operator`,
    token_rotated_at: timestamp,
  },
  ticket: {
    event_id: "velvet-2026",
    event_name: "Velvet",
    valid_from: null,
    valid_until: null,
  },
  dashboard_url: `https://portal.authbound.io/projects/00000000-0000-4000-8000-000000000456/stations/${stationId}`,
  settings: {
    allow_concurrent: true,
    ttl_seconds: null,
  },
};

const stationResponseWithoutLiveEntry = {
  ...stationResponse,
  entry: {
    ...stationResponse.entry,
    entry_url: null,
    qr_payload: null,
    nfc_payload: null,
  },
};

const stationDisplayResponse = {
  object: "station",
  id: stationResponse.id,
  status: stationResponse.status,
  label: stationResponse.label,
  entry: stationResponse.entry,
  ticket: stationResponse.ticket,
};

const stationVerificationResponse = {
  object: "station_verification",
  station_id: stationId,
  verification_id: verificationId,
  env_mode: "test",
  status: "verified",
  created_at: "2026-06-07T12:01:00.000Z",
  terminal_at: "2026-06-07T12:02:00.000Z",
  transport: "qr",
  client_ref: "client-1",
  failure_code: null,
  outcome_reason: null,
  assertions: {
    age_over_18: true,
    ticket_valid: true,
    event_id: "velvet-2026",
  },
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function createClient(): AuthboundClient {
  return new AuthboundClient({ apiKey, apiUrl });
}

describe("AuthboundClient stations API", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse(stationResponse))
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("creates stations with the secret-key REST contract", async () => {
    const fetchMock = vi.fn(async () => jsonResponse(stationResponse, 201));
    vi.stubGlobal("fetch", fetchMock);

    const station = await createClient().stations.create({
      policyRef: "pol_station_age_ticket_v1@1",
      label: "Velvet door",
      ttlSeconds: 3600,
      ticketEventId: "velvet-2026",
      ticketEventName: "Velvet 2026",
      ticketValidFrom: "2026-06-21T18:00:00.000Z",
      ticketValidUntil: "2026-06-22T02:00:00.000Z",
    });

    expect(station).toMatchObject({
      object: "station",
      id: stationId,
      policyRef: "pol_station_age_ticket_v1@1",
      display: {
        entryDisplayUrl: stationResponse.display.entry_display_url,
        operatorConsoleUrl: stationResponse.display.operator_console_url,
      },
    });
    expect(fetchMock).toHaveBeenCalledWith(
      `${apiUrl}/v1/stations`,
      expect.objectContaining({ method: "POST" })
    );
    const [, request] = fetchMock.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(request.headers).toMatchObject({
      "X-Authbound-Key": apiKey,
    });
    expect(request.headers).not.toHaveProperty("Idempotency-Key");
    expect(JSON.parse(request.body as string)).toEqual({
      policy_ref: "pol_station_age_ticket_v1@1",
      label: "Velvet door",
      ttl_seconds: 3600,
      ticket_event_id: "velvet-2026",
      ticket_event_name: "Velvet 2026",
      ticket_valid_from: "2026-06-21T18:00:00.000Z",
      ticket_valid_until: "2026-06-22T02:00:00.000Z",
    });
  });

  it("lists, rotates, and manages operator device grants", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({
          object: "list",
          data: [stationResponseWithoutLiveEntry],
          has_more: true,
          next_cursor: "cursor_next",
        })
      )
      .mockResolvedValueOnce(jsonResponse(stationResponse))
      .mockResolvedValueOnce(
        jsonResponse({
          object: "station_operator_grant",
          id: "grant_123",
          station_id: stationId,
          profile: "physical_id",
          token: "sog_secret",
          expires_at: "2026-06-07T20:00:00.000Z",
          created_at: timestamp,
          revoked_at: null,
        })
      )
      .mockResolvedValueOnce(
        jsonResponse({
          object: "station_operator_grant",
          id: "grant_123",
          station_id: stationId,
          profile: "physical_id",
          expires_at: "2026-06-07T20:00:00.000Z",
          created_at: timestamp,
          revoked_at: "2026-06-07T13:00:00.000Z",
        })
      );
    vi.stubGlobal("fetch", fetchMock);

    const client = createClient();
    const list = await client.stations.list({
      limit: 10,
      cursor: "cursor_123",
    });
    await client.stations.rotateDisplayToken(stationId);
    const grant = await client.stations.createOperatorGrant(stationId, {
      profile: "physical_id",
      deviceRef: "door-ipad-1",
      operatorRef: "staff-1",
      ttlSeconds: 3600,
    });
    const revoked = await client.stations.revokeOperatorGrant(
      stationId,
      "grant_123"
    );

    expect(list.data[0]?.id).toBe(stationId);
    expect(list.data[0]?.entry.entryUrl).toBeUndefined();
    expect(list.data[0]?.entry.qrPayload).toBeUndefined();
    expect(list.data[0]?.entry.nfcPayload).toBeUndefined();
    expect(list.hasMore).toBe(true);
    expect(list.nextCursor).toBe("cursor_next");
    expect(grant.token).toBe("sog_secret");
    expect(revoked.revokedAt).toBe("2026-06-07T13:00:00.000Z");
    expect(
      fetchMock.mock.calls.map(([url, init]) => [
        url,
        (init as RequestInit).method,
      ])
    ).toEqual([
      [`${apiUrl}/v1/stations?limit=10&cursor=cursor_123`, "GET"],
      [`${apiUrl}/v1/stations/${stationId}/display-token/rotate`, "POST"],
      [`${apiUrl}/v1/stations/${stationId}/operator-grants`, "POST"],
      [
        `${apiUrl}/v1/stations/${stationId}/operator-grants/grant_123/revoke`,
        "POST",
      ],
    ]);
    expect(JSON.parse(fetchMock.mock.calls[2]?.[1].body as string)).toEqual({
      profile: "physical_id",
      device_ref: "door-ipad-1",
      operator_ref: "staff-1",
      ttl_seconds: 3600,
    });
  });

  it("lists station events with cursor pagination", async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({
        object: "list",
        data: [
          {
            id: "evt_123",
            type: "station.verification.completed",
            cursor: 42,
            created_at: "2026-06-07T12:02:00.000Z",
            data: {
              station_id: stationId,
              verification_id: verificationId,
              status: "verified",
            },
          },
        ],
        has_more: true,
        next_cursor: 42,
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    const events = await createClient().stations.listEvents(stationId, {
      after: 12,
      limit: 25,
    });

    expect(events).toEqual({
      object: "list",
      data: [
        {
          id: "evt_123",
          type: "station.verification.completed",
          cursor: 42,
          createdAt: "2026-06-07T12:02:00.000Z",
          data: {
            station_id: stationId,
            verification_id: verificationId,
            status: "verified",
          },
        },
      ],
      hasMore: true,
      nextCursor: 42,
    });
    const [eventsUrl] = fetchMock.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(eventsUrl).toBe(
      `${apiUrl}/v1/stations/${stationId}/events?after=12&limit=25`
    );
  });

  it("reads token-only station display and grant-protected disclosure without a secret key", async () => {
    const { client_ref: _clientRef, ...publicStationVerificationResponse } =
      stationVerificationResponse;
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({
          object: "station_display",
          station: stationDisplayResponse,
          verifications: [publicStationVerificationResponse],
        })
      )
      .mockResolvedValueOnce(
        jsonResponse({
          object: "station_verification_disclosure",
          station_id: stationId,
          verification_id: verificationId,
          profile: "physical_id",
          fields: {
            portrait: "data:image/jpeg;base64,portrait",
            given_name: "Ada",
            family_name: "Lovelace",
            birth_date: "1815-12-10",
            age_over_18: true,
            ticket_valid: true,
          },
          granted_at: "2026-06-07T12:02:00.000Z",
          expires_at: "2026-06-07T20:02:00.000Z",
        })
      );
    vi.stubGlobal("fetch", fetchMock);

    const client = createClient();
    const display = await client.stations.getDisplay({
      stationId,
      displayToken: "display-token",
    });
    const disclosure = await client.stations.getVerificationDisclosure({
      stationId,
      verificationId,
      displayToken: "display-token",
      grantToken: "grant-token",
    });

    expect(display.verifications[0]?.assertions).not.toHaveProperty("portrait");
    expect(display.station).toMatchObject({
      object: "station",
      id: stationId,
      entry: {
        qrPayload: stationResponse.entry.qr_payload,
      },
    });
    expect(display.station).not.toHaveProperty("projectId");
    expect(display.station).not.toHaveProperty("policyRef");
    expect(display.station).not.toHaveProperty("dashboardUrl");
    expect(disclosure.fields.givenName).toBe("Ada");
    const [, displayRequest] = fetchMock.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    const [, disclosureRequest] = fetchMock.mock.calls[1] as unknown as [
      string,
      RequestInit,
    ];
    expect(displayRequest.headers).not.toHaveProperty("X-Authbound-Key");
    expect(disclosureRequest.headers).not.toHaveProperty("X-Authbound-Key");
    expect(disclosureRequest.headers).toMatchObject({
      "X-Authbound-Station-Display-Token": "display-token",
      "X-Authbound-Station-Operator-Grant-Token": "grant-token",
    });
    expect(fetchMock.mock.calls[1]?.[0]).toBe(
      `${apiUrl}/v1/stations/public/${stationId}/verifications/${verificationId}/disclosure`
    );
  });

  it("redacts station display tokens from debug request logs", async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({
        object: "station_display",
        station: stationDisplayResponse,
        verifications: [],
      })
    );
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    vi.stubGlobal("fetch", fetchMock);

    const client = new AuthboundClient({ apiKey, apiUrl, debug: true });
    await client.stations.getDisplay({
      stationId,
      displayToken: "display-token-secret",
    });

    const logged = JSON.stringify(logSpy.mock.calls);
    expect(logged).toContain("redacted");
    expect(logged).not.toContain("display-token-secret");
    expect(logged).not.toContain("token=display-token-secret");

    logSpy.mockRestore();
  });
});
