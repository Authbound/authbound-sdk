import { describe, expect, it } from "vitest";

describe("browser verification type exports", () => {
  it("does not expose result or attribute schemas from core browser exports", async () => {
    const core = await import("../../index");

    expect(core).not.toHaveProperty("VerificationResultSchema");
    expect(core).not.toHaveProperty("VerificationAttributesSchema");
    expect(core).not.toHaveProperty("ResultTokenClaimsSchema");
    expect(core).not.toHaveProperty("RESULT_COOKIE_NAME");
  });
});
