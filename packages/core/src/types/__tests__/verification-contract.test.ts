import { describe, expect, it } from "vitest";
import { VerificationClaimsSchema } from "../verification";

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
