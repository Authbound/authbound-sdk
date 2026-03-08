import { describe, expect, it } from "vitest";

import { AuthboundError } from "../errors";

describe("AuthboundError.fromResponse", () => {
  it("uses the error field as a message fallback", () => {
    const response = new Response(null, {
      status: 401,
      headers: {
        "Content-Type": "application/json",
      },
    });

    const error = AuthboundError.fromResponse(response, {
      code: "auth_required",
      error: "Authentication required",
    });

    expect(error.code).toBe("token_invalid");
    expect(error.message).toBe("Authentication required");
  });

  it("preserves extra response fields in details", () => {
    const response = new Response(null, {
      status: 403,
      headers: {
        "Content-Type": "application/json",
      },
    });

    const error = AuthboundError.fromResponse(response, {
      code: "organization_unauthorized",
      error: "Authbound organization access is required",
      details: {
        reason: "org_mismatch",
      },
      signInPath: "/sign-in?returnTo=%2Fverify",
    });

    expect(error.code).toBe("token_signature_invalid");
    expect(error.details).toEqual({
      reason: "org_mismatch",
      signInPath: "/sign-in?returnTo=%2Fverify",
    });
  });
});
