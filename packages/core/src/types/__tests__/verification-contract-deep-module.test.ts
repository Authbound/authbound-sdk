import { describe, expect, it } from "vitest";
import {
  isTerminalVerificationProgressStatus,
  ProviderPreferenceSchema,
  PublicCreateVerificationResponseSchema,
  PublicVerificationSchema,
  projectVerificationStatusForUi,
  VerificationProgressStatusSchema,
} from "../verification-contract";

describe("public verification contract module", () => {
  it("defines the precise public progress statuses from OpenAPI separately from UI projection", () => {
    expect(VerificationProgressStatusSchema.options).toEqual([
      "created",
      "awaiting_user",
      "awaiting_provider",
      "processing",
      "verified",
      "failed",
      "canceled",
      "expired",
    ]);

    expect(projectVerificationStatusForUi("created")).toBe("pending");
    expect(projectVerificationStatusForUi("awaiting_user")).toBe("pending");
    expect(projectVerificationStatusForUi("awaiting_provider")).toBe("pending");
    expect(projectVerificationStatusForUi("processing")).toBe("processing");
    expect(projectVerificationStatusForUi("verified")).toBe("verified");
    expect(projectVerificationStatusForUi("failed")).toBe("failed");
    expect(projectVerificationStatusForUi("canceled")).toBe("canceled");
    expect(projectVerificationStatusForUi("expired")).toBe("expired");
  });

  it("rejects stale provider vocabulary at the shared contract", () => {
    expect(ProviderPreferenceSchema.safeParse("auto").success).toBe(true);
    expect(ProviderPreferenceSchema.safeParse("vcs").success).toBe(false);
    expect(ProviderPreferenceSchema.safeParse("eudi").success).toBe(true);
    expect(ProviderPreferenceSchema.safeParse("reverify").success).toBe(false);
  });

  it("rejects stale provider and failure-code vocabulary on public verification responses", () => {
    const response = {
      object: "verification",
      id: "3639989b-baf7-413b-b769-4189ea705340",
      status: "failed",
      policy_id: "pol_age_over_18_authbound_v1",
      provider: "eudi",
      env_mode: "test",
      created_at: "2026-04-21T10:00:00.000Z",
      expires_at: "2026-04-21T10:10:00.000Z",
      failure_code: "wallet_error",
    };

    expect(PublicVerificationSchema.safeParse(response).success).toBe(true);
    expect(
      PublicVerificationSchema.safeParse({
        ...response,
        provider: "reverify",
      }).success
    ).toBe(false);
    expect(
      PublicVerificationSchema.safeParse({
        ...response,
        failure_code: "legacy_failure",
      }).success
    ).toBe(false);
  });

  it("accepts a failure reason from the closed list only", () => {
    const failed = {
      object: "verification",
      id: "vrf_reason",
      status: "failed",
      policy_id: "pol_age_over_18_authbound_v1",
      provider: "eudi",
      env_mode: "test",
      created_at: "2026-11-28T10:00:00.000Z",
      expires_at: "2026-11-28T10:15:00.000Z",
      failure_code: "wallet_error",
      failure_reason: "invalid_client",
    };
    expect(PublicVerificationSchema.safeParse(failed).success).toBe(true);
    expect(
      PublicVerificationSchema.safeParse({
        ...failed,
        status: "expired",
        failure_code: undefined,
        failure_reason: "request_not_fetched",
      }).success
    ).toBe(true);
    expect(
      PublicVerificationSchema.safeParse({
        ...failed,
        failure_reason: "https://issuer.example",
      }).success
    ).toBe(false);
    expect(
      PublicCreateVerificationResponseSchema.safeParse({
        ...failed,
        client_token: "ct",
        failure_reason: "credential_revoked",
      }).success
    ).toBe(true);
  });

  it("requires OpenAPI-required public verification fields", () => {
    const response = {
      object: "verification",
      id: "3639989b-baf7-413b-b769-4189ea705340",
      status: "created",
      policy_id: "pol_age_over_18_authbound_v1",
      env_mode: "test",
      created_at: "2026-04-21T10:00:00.000Z",
      expires_at: "2026-04-21T10:10:00.000Z",
      terminal_at: null,
      failure_code: null,
    };

    expect(PublicVerificationSchema.safeParse(response).success).toBe(true);

    for (const key of ["policy_id", "env_mode", "created_at", "expires_at"]) {
      const missing = { ...response } as Record<string, unknown>;
      delete missing[key];

      expect(PublicVerificationSchema.safeParse(missing).success).toBe(false);
    }
  });

  it("requires client_token on create verification responses only", () => {
    const response = {
      object: "verification",
      id: "3639989b-baf7-413b-b769-4189ea705340",
      status: "created",
      policy_id: "pol_age_over_18_authbound_v1",
      env_mode: "test",
      created_at: "2026-04-21T10:00:00.000Z",
      expires_at: "2026-04-21T10:10:00.000Z",
    };

    expect(PublicVerificationSchema.safeParse(response).success).toBe(true);
    expect(
      PublicVerificationSchema.safeParse({
        ...response,
        client_token: "client_token_123",
      }).success
    ).toBe(false);
    expect(
      PublicCreateVerificationResponseSchema.safeParse(response).success
    ).toBe(false);
    expect(
      PublicCreateVerificationResponseSchema.safeParse({
        ...response,
        client_token: "client_token_123",
      }).success
    ).toBe(true);
  });

  it("requires wallet handoff client actions to carry non-empty data", () => {
    const response = {
      object: "verification",
      id: "3639989b-baf7-413b-b769-4189ea705340",
      status: "awaiting_user",
      policy_id: "pol_age_over_18_authbound_v1",
      env_mode: "test",
      created_at: "2026-04-21T10:00:00.000Z",
      expires_at: "2026-04-21T10:10:00.000Z",
      client_action: {
        kind: "link",
        data: "openid4vp://authorize?request_uri=https%3A%2F%2Fgateway.example.com%2Frequest",
        expires_at: "2026-04-21T10:10:00.000Z",
      },
    };

    expect(PublicVerificationSchema.safeParse(response).success).toBe(true);
    expect(
      PublicVerificationSchema.safeParse({
        ...response,
        client_action: {
          ...response.client_action,
          data: "",
        },
      }).success
    ).toBe(false);
  });

  it("uses one terminal-state definition for public progress statuses", () => {
    expect(isTerminalVerificationProgressStatus("created")).toBe(false);
    expect(isTerminalVerificationProgressStatus("awaiting_user")).toBe(false);
    expect(isTerminalVerificationProgressStatus("processing")).toBe(false);
    expect(isTerminalVerificationProgressStatus("verified")).toBe(true);
    expect(isTerminalVerificationProgressStatus("failed")).toBe(true);
    expect(isTerminalVerificationProgressStatus("canceled")).toBe(true);
    expect(isTerminalVerificationProgressStatus("expired")).toBe(true);
  });
});
