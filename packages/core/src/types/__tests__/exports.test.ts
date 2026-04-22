import { describe, expect, it } from "vitest";

describe("core public exports", () => {
  it("does not expose legacy session-shaped runtime schemas", async () => {
    const core = await import("../../index");

    expect(core).not.toHaveProperty(
      ["Verification", "Session", "StatusSchema"].join("")
    );
    expect(core).not.toHaveProperty(
      ["Verification", "Session", "ObjectSchema"].join("")
    );
    expect(core).not.toHaveProperty("AuthboundClaimsSchema");
  });
});
