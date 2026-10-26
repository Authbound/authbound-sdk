import { describe, expect, it } from "vitest";
import { meetsMinimumAge, selectAgeClaims } from "./age-claims";
import { createToken, getVerificationFromToken } from "./jwt";
import { checkRequirements } from "./types";

const AV_NAMESPACE = "eu.europa.ec.av.1";
const today = new Date("2026-10-26T12:00:00.000Z");

describe("meetsMinimumAge", () => {
  it.each([
    ["AV attestation", { [AV_NAMESPACE]: { age_over_18: true } }],
    ["top-level age_over", { age_over_18: true }],
    ["SD-JWT PID", { age_equal_or_over: { "18": true } }],
  ])("%s 18 meets minAge 18", (_shape, claims) => {
    expect(meetsMinimumAge(claims, 18, today)).toBe(true);
  });

  it.each([
    ["AV attestation", { [AV_NAMESPACE]: { age_over_18: true } }],
    ["SD-JWT PID", { age_equal_or_over: { "18": true } }],
  ])("%s 18 does not meet minAge 21", (_shape, claims) => {
    expect(meetsMinimumAge(claims, 21, today)).toBe(false);
  });

  it.each([
    ["AV attestation", { [AV_NAMESPACE]: { age_over_21: true } }],
    ["SD-JWT PID", { age_equal_or_over: { "21": true } }],
  ])("%s 21 meets minAge 18", (_shape, claims) => {
    expect(meetsMinimumAge(claims, 18, today)).toBe(true);
  });

  it.each([
    ["AV attestation", { [AV_NAMESPACE]: { age_over_18: false } }],
    ["SD-JWT PID", { age_equal_or_over: { "18": false } }],
    ["string value", { age_over_18: "true" }],
  ])("%s that is not true fails", (_shape, claims) => {
    expect(meetsMinimumAge(claims, 18, today)).toBe(false);
  });

  it("meets the minimum age from the eighteenth birthday onwards, in UTC", () => {
    expect(meetsMinimumAge({ birthdate: "2008-10-26" }, 18, today)).toBe(true);
    expect(meetsMinimumAge({ birthdate: "2008-10-27" }, 18, today)).toBe(false);
    expect(
      meetsMinimumAge(
        { birthdate: "2008-10-27" },
        18,
        new Date("2026-10-26T23:59:59.999Z")
      )
    ).toBe(false);
    expect(
      meetsMinimumAge(
        { "org.iso.18013.5.1": { birth_date: "2008-10-26" } },
        18,
        today
      )
    ).toBe(true);
  });

  it("moves a February 29 birthday to February 28 in common years", () => {
    const birthDate = { birthdate: "2008-02-29" };
    expect(
      meetsMinimumAge(birthDate, 18, new Date("2026-02-27T12:00:00.000Z"))
    ).toBe(false);
    expect(
      meetsMinimumAge(birthDate, 18, new Date("2026-02-28T00:00:00.000Z"))
    ).toBe(true);
    expect(
      meetsMinimumAge(birthDate, 16, new Date("2024-02-28T12:00:00.000Z"))
    ).toBe(false);
    expect(
      meetsMinimumAge(birthDate, 16, new Date("2024-02-29T00:00:00.000Z"))
    ).toBe(true);
  });

  it.each([
    "2008-02-30",
    "2007-02-29",
    "2008-13-01",
    "2008-1-01",
    "2008-01-01T00:00:00Z",
    "01.01.2008",
    "",
  ])("fails an unparseable birth date %j", (birthdate) => {
    expect(meetsMinimumAge({ birthdate }, 1, today)).toBe(false);
  });

  it("fails without age claims", () => {
    expect(meetsMinimumAge(undefined, 18, today)).toBe(false);
    expect(meetsMinimumAge({ given_name: "Test" }, 18, today)).toBe(false);
  });
});

describe("minAge route requirement", () => {
  it("checks the age claims kept in the session token", async () => {
    const secret = "session-secret-at-least-32-characters";
    const token = await createToken({
      secret,
      userRef: "user_123",
      verificationId: "vrf_123",
      status: "VERIFIED",
      assuranceLevel: "SUBSTANTIAL",
      ageClaims: selectAgeClaims({
        [AV_NAMESPACE]: { age_over_18: true },
      }),
    });
    const verification = await getVerificationFromToken(token, secret);

    expect(verification?.ageClaims).toEqual({
      [AV_NAMESPACE]: { age_over_18: true },
    });
    expect(checkRequirements(verification, { minAge: 18 }).met).toBe(true);
    expect(checkRequirements(verification, { minAge: 21 })).toEqual({
      met: false,
      reason: "Minimum age of 21 required",
    });
  });
});

describe("selectAgeClaims", () => {
  it("keeps the disclosed age claims unchanged and drops every other claim", () => {
    expect(
      selectAgeClaims({
        given_name: "Test",
        age_equal_or_over: { "18": true },
        birthdate: "1990-05-15",
        [AV_NAMESPACE]: { age_over_18: true },
        "org.iso.18013.5.1": { family_name: "Person" },
      })
    ).toEqual({
      age_equal_or_over: { "18": true },
      birthdate: "1990-05-15",
      [AV_NAMESPACE]: { age_over_18: true },
    });
    expect(selectAgeClaims({ pension: { typeCode: "KE" } })).toBeUndefined();
    expect(selectAgeClaims(undefined)).toBeUndefined();
  });
});
