import { describe, expect, it } from "vitest";
import { VerificationClaimsSchema } from "../verification";
import {
  PublicVerificationSchema,
  PublicVerificationStatusSnapshotSchema,
  SignedVerificationResultSchema,
} from "../verification-contract";

const timestamp = "2026-04-21T10:00:00.000Z";

const activeVerification = {
  object: "verification",
  id: "vrf_123",
  status: "awaiting_user",
  policy_id: "pol_age_over_18_authbound_v1",
  policy_hash: "pol_hash_123",
  provider: "eudi",
  env_mode: "test",
  created_at: timestamp,
  expires_at: "2026-04-21T10:10:00.000Z",
  terminal_at: null,
  failure_code: null,
  client_action: {
    kind: "link",
    data: "openid4vp://authorize?request_uri=https%3A%2F%2Fgateway.example.com%2Frequest",
    expires_at: "2026-04-21T10:10:00.000Z",
  },
  verification_url: "https://verify.example.com/vrf_123",
  customer_user_ref: "user_123",
  metadata: { purpose: "age_gate" },
} as const;

describe("browser verification type exports", () => {
  it("does not expose result or attribute schemas from core browser exports", async () => {
    const core = await import("../../index");

    expect(core).not.toHaveProperty("VerificationResultSchema");
    expect(core).not.toHaveProperty("VerificationAttributesSchema");
    expect(core).not.toHaveProperty("ResultTokenClaimsSchema");
    expect(core).not.toHaveProperty("RESULT_COOKIE_NAME");
  });

  it("only accepts MVP verification claims", () => {
    expect(
      VerificationClaimsSchema.safeParse({ age_over_18: true }).success
    ).toBe(true);

    expect(
      VerificationClaimsSchema.safeParse({ age_over_21: true }).success
    ).toBe(false);
    expect(
      VerificationClaimsSchema.safeParse({ age_over_65: true }).success
    ).toBe(false);
    expect(
      VerificationClaimsSchema.safeParse({ driving_license_valid: true })
        .success
    ).toBe(false);
    expect(
      VerificationClaimsSchema.safeParse({ eu_resident: true }).success
    ).toBe(false);
  });
});

describe("public verification contract security invariants", () => {
  it("rejects terminal verification objects that still expose wallet handoff", () => {
    expect(
      PublicVerificationSchema.safeParse({
        ...activeVerification,
        status: "verified",
        terminal_at: "2026-04-21T10:01:00.000Z",
        client_action: activeVerification.client_action,
      }).success
    ).toBe(false);

    expect(
      PublicVerificationSchema.safeParse({
        ...activeVerification,
        status: "canceled",
        terminal_at: "2026-04-21T10:01:00.000Z",
        client_action: activeVerification.client_action,
      }).success
    ).toBe(false);
  });

  it("enforces public failure_code semantics on verification objects", () => {
    expect(
      PublicVerificationSchema.safeParse({
        ...activeVerification,
        status: "failed",
        terminal_at: "2026-04-21T10:01:00.000Z",
        client_action: null,
        failure_code: null,
      }).success
    ).toBe(false);

    expect(
      PublicVerificationSchema.safeParse({
        ...activeVerification,
        status: "verified",
        terminal_at: "2026-04-21T10:01:00.000Z",
        client_action: null,
        failure_code: "policy_not_satisfied",
      }).success
    ).toBe(false);

    expect(
      PublicVerificationSchema.safeParse({
        ...activeVerification,
        status: "failed",
        terminal_at: "2026-04-21T10:01:00.000Z",
        client_action: null,
        failure_code: "policy_not_satisfied",
      }).success
    ).toBe(true);
  });

  it("accepts browser-native DC API client actions", () => {
    expect(
      PublicVerificationSchema.safeParse({
        ...activeVerification,
        client_action: {
          kind: "dc_api",
          data: JSON.stringify({
            client_id: "x509_hash:Verifier",
            request_uri: "https://verifier.example/request.jwt/req_dc_api",
          }),
          expires_at: "2026-04-21T10:10:00.000Z",
        },
      }).success
    ).toBe(true);
  });

  it("rejects public verification metadata that smuggles private verification material", () => {
    for (const unsafeKey of [
      "client_token",
      "result_token",
      "assertions",
      "result",
      "verification_url",
      "client_action",
      "clientAction",
      "gateway",
      "nonce",
    ]) {
      expect(
        PublicVerificationSchema.safeParse({
          ...activeVerification,
          metadata: {
            purpose: "age_gate",
            [unsafeKey]: "unsafe",
          },
        }).success
      ).toBe(false);
    }

    expect(
      PublicVerificationSchema.safeParse({
        ...activeVerification,
        metadata: {
          purpose: "age_gate",
          cohort: "checkout",
        },
      }).success
    ).toBe(true);
  });

  it("rejects client-token status snapshots that leak terminal wallet handoff", () => {
    expect(
      PublicVerificationStatusSnapshotSchema.safeParse({
        object: "verification_status",
        id: "vrf_123",
        status: "expired",
        failure_code: null,
        client_action: activeVerification.client_action,
      }).success
    ).toBe(false);
  });

  const verifiedResult = {
    verification_id: "vrf_123",
    status: "verified",
    result_token: "result.jwt",
    claims_status: "available",
    claims: { age_equal_or_over: { "18": true } },
    claims_salt: "k3dQwUoRCeyyo-bL8x3icmQ5VpGAiTXfD3ijFauSQW4",
  } as const;

  it("result schema accepts claims_status claims and claims_salt", () => {
    expect(
      SignedVerificationResultSchema.safeParse(verifiedResult).success
    ).toBe(true);

    const {
      claims: _claims,
      claims_salt: _salt,
      ...withoutClaims
    } = verifiedResult;
    for (const claimsStatus of ["expired", "none"]) {
      expect(
        SignedVerificationResultSchema.safeParse({
          ...withoutClaims,
          claims_status: claimsStatus,
        }).success
      ).toBe(true);
    }
  });

  it("result schema rejects assertions", () => {
    expect(
      SignedVerificationResultSchema.safeParse({
        ...verifiedResult,
        assertions: { age_over_18: true },
      }).success
    ).toBe(false);
  });

  it("result schema delivers claims and claims_salt together only while available", () => {
    const { claims, claims_salt, ...withoutClaims } = verifiedResult;
    for (const partial of [
      { ...withoutClaims, claims },
      { ...withoutClaims, claims_salt },
      { ...withoutClaims, claims_status: "expired", claims, claims_salt },
      { ...withoutClaims, claims_status: "none", claims_salt },
      withoutClaims,
    ]) {
      expect(SignedVerificationResultSchema.safeParse(partial).success).toBe(
        false
      );
    }
  });

  it("enforces signed result failure_code semantics", () => {
    const failedResult = {
      verification_id: "vrf_123",
      status: "failed",
      result_token: "result.jwt",
      claims_status: "none",
      failure_code: "policy_not_satisfied",
    } as const;

    expect(SignedVerificationResultSchema.safeParse(failedResult).success).toBe(
      true
    );

    const { failure_code: _failureCode, ...failedWithoutCode } = failedResult;
    expect(
      SignedVerificationResultSchema.safeParse(failedWithoutCode).success
    ).toBe(false);

    expect(
      SignedVerificationResultSchema.safeParse({
        ...verifiedResult,
        failure_code: "policy_not_satisfied",
      }).success
    ).toBe(false);

    expect(
      SignedVerificationResultSchema.safeParse({
        ...verifiedResult,
        status: "failed",
        failure_code: "policy_not_satisfied",
      }).success
    ).toBe(false);
  });
});
