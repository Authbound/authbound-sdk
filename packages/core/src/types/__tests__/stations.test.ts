import { describe, expect, it } from "vitest";
import {
  buildStationDisclosureUrl,
  buildStationDisplayEventsUrl,
  buildStationDisplayUrl,
  buildStationEntryUrl,
  buildStationOperatorEventsUrl,
  buildStationOperatorUrl,
  StationDisplaySchema,
  StationSafeAssertionsSchema,
  StationSchema,
  StationSpawnSchema,
  StationVerificationDisclosureSchema,
} from "../../index";

const station = {
  object: "station",
  id: "00000000-0000-4000-8000-000000000123",
  project_id: "00000000-0000-4000-8000-000000000456",
  env_mode: "test",
  status: "active",
  policy_ref: "pol_station_age_ticket_v1@1",
  policy_hash: "sha256:policy",
  label: "Velvet door",
  created_at: "2026-06-07T12:00:00.000Z",
  expires_at: null,
  closed_at: null,
  entry: {
    entry_url:
      "https://velvet.authbound.app/verify/stations/00000000-0000-4000-8000-000000000123",
    qr_payload:
      "https://velvet.authbound.app/verify/stations/00000000-0000-4000-8000-000000000123?transport=qr",
    nfc_payload:
      "https://velvet.authbound.app/verify/stations/00000000-0000-4000-8000-000000000123?transport=nfc",
    token_expires_at: "2026-06-07T12:10:00.000Z",
  },
  display: {
    entry_display_url:
      "https://velvet.authbound.app/stations/00000000-0000-4000-8000-000000000123/display",
    operator_console_url:
      "https://velvet.authbound.app/stations/00000000-0000-4000-8000-000000000123/operator",
    token_rotated_at: "2026-06-07T12:00:00.000Z",
  },
  ticket: {
    event_id: "velvet-2026",
    event_name: "Velvet",
    valid_from: null,
    valid_until: null,
  },
  dashboard_url:
    "https://portal.authbound.io/projects/00000000-0000-4000-8000-000000000456/stations/00000000-0000-4000-8000-000000000123",
  settings: {
    allow_concurrent: true,
    ttl_seconds: null,
  },
} as const;

const displayStation = {
  object: "station",
  id: station.id,
  status: station.status,
  label: station.label,
  entry: station.entry,
  ticket: station.ticket,
} as const;

describe("station contracts", () => {
  it("parses station payloads without live entry URLs", () => {
    const parsed = StationSchema.parse({
      ...station,
      entry: {
        ...station.entry,
        entry_url: null,
        qr_payload: null,
        nfc_payload: null,
      },
    });

    expect(parsed.entry.entry_url).toBeNull();
    expect(parsed.entry.qr_payload).toBeNull();
    expect(parsed.entry.nfc_payload).toBeNull();
  });

  it("rejects PID fields from token-only station-safe assertions", () => {
    expect(
      StationSafeAssertionsSchema.safeParse({
        age_over_18: true,
        ticket_valid: true,
        event_id: "velvet-2026",
      }).success
    ).toBe(true);

    expect(
      StationSafeAssertionsSchema.safeParse({
        age_over_18: true,
        portrait: "data:image/jpeg;base64,portrait",
        given_name: "Ada",
        family_name: "Lovelace",
        birth_date: "1815-12-10",
      }).success
    ).toBe(false);
  });

  it("parses split station display payloads without sensitive PID fields", () => {
    const parsed = StationDisplaySchema.parse({
      object: "station_display",
      station: displayStation,
      verifications: [
        {
          object: "station_verification",
          station_id: station.id,
          verification_id: "00000000-0000-4000-8000-000000000789",
          env_mode: "test",
          status: "verified",
          created_at: "2026-06-07T12:01:00.000Z",
          terminal_at: "2026-06-07T12:02:00.000Z",
          transport: "qr",
          failure_code: null,
          outcome_reason: null,
          assertions: {
            age_over_18: true,
            ticket_valid: true,
            event_id: "velvet-2026",
          },
        },
      ],
    });

    expect(parsed.station.entry.qr_payload).toContain("transport=qr");
    expect(parsed.station).not.toHaveProperty("project_id");
    expect(parsed.station).not.toHaveProperty("policy_ref");
    expect(parsed.station).not.toHaveProperty("dashboard_url");
    expect(parsed.verifications[0]?.assertions).not.toHaveProperty("portrait");
    expect(parsed.verifications[0]).not.toHaveProperty("client_ref");
  });

  it("rejects station management fields from token-only display payloads", () => {
    expect(
      StationDisplaySchema.safeParse({
        object: "station_display",
        station: {
          ...displayStation,
          project_id: station.project_id,
        },
        verifications: [],
      }).success
    ).toBe(false);
  });

  it("allows explicit grant-protected physical ID disclosures", () => {
    expect(
      StationVerificationDisclosureSchema.parse({
        object: "station_verification_disclosure",
        station_id: station.id,
        verification_id: "00000000-0000-4000-8000-000000000789",
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
      }).fields
    ).toMatchObject({
      given_name: "Ada",
      birth_date: "1815-12-10",
    });
  });

  it("accepts dc_api station spawn handoffs", () => {
    const parsed = StationSpawnSchema.parse({
      object: "station_spawn",
      station_id: station.id,
      verification_id: "vrf_dc_api",
      client_action: {
        kind: "dc_api",
        data: JSON.stringify({
          request_uri: "https://verifier.example/request.jwt/req_dc_api",
        }),
        expires_at: "2026-06-07T12:10:00.000Z",
      },
    });

    expect(parsed.client_action?.kind).toBe("dc_api");
  });

  it("builds direct and proxy station runtime URLs", () => {
    expect(
      buildStationEntryUrl({
        baseUrl: "https://api.authbound.test",
        stationId: "stn_123",
        token: "entry_token",
      })
    ).toBe(
      "https://api.authbound.test/v1/stations/public/stn_123/verifications?token=entry_token"
    );
    expect(
      buildStationDisplayUrl({
        mode: "proxy",
        stationId: "stn_123",
        token: "display_token",
      })
    ).toBe("/api/authbound/stations/stn_123/display?token=display_token");
    expect(
      buildStationDisplayUrl({
        mode: "proxy",
        stationId: "stn_123",
        token: "display_token",
        refreshEntryToken: true,
      })
    ).toBe(
      "/api/authbound/stations/stn_123/display?token=display_token&refresh_entry_token=true"
    );
    expect(
      buildStationDisplayEventsUrl({
        baseUrl: "https://app.test",
        mode: "proxy",
        stationId: "stn_123",
        token: "display_token",
      })
    ).toBe(
      "https://app.test/api/authbound/stations/stn_123/display/events/sse?token=display_token"
    );
    expect(
      buildStationOperatorUrl({
        mode: "proxy",
        stationId: "stn_123",
      })
    ).toBe("/api/authbound/stations/stn_123/operator");
    expect(
      buildStationOperatorEventsUrl({
        baseUrl: "https://app.test",
        mode: "proxy",
        stationId: "stn_123",
        grantToken: "grant_token",
      })
    ).toBe(
      "https://app.test/api/authbound/stations/stn_123/operator/events/sse?grant_token=grant_token"
    );
    expect(
      buildStationDisclosureUrl({
        mode: "proxy",
        stationId: "stn_123",
        verificationId: "vrf_123",
        grantToken: "grant_token",
      })
    ).toBe("/api/authbound/stations/stn_123/verifications/vrf_123/disclosure");
  });
});
