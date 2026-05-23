import { describe, expect, it } from "vitest";

import { assertBrowserSafeStatusPayload } from "../browser-safe-status";

describe("browser-safe status payload guard", () => {
  it("rejects wallet handoff data after terminal statuses", () => {
    expect(() =>
      assertBrowserSafeStatusPayload({
        object: "verification_status",
        id: "vrf_test123",
        status: "verified",
        client_action: {
          kind: "link",
          data: "openid4vp://authorize",
          expires_at: "2026-04-21T10:10:00.000Z",
        },
      })
    ).toThrow("terminal verification status");

    expect(() =>
      assertBrowserSafeStatusPayload({
        object: "verification_status",
        id: "vrf_test123",
        status: "failed",
        clientAction: {
          kind: "qr",
          data: "openid4vp://authorize",
          expiresAt: "2026-04-21T10:10:00.000Z",
        },
      })
    ).toThrow("terminal verification status");
  });

  it("rejects public failure-code drift in browser status payloads", () => {
    expect(() =>
      assertBrowserSafeStatusPayload({
        object: "verification_status",
        id: "vrf_test123",
        status: "failed",
      })
    ).toThrow("failed status response");

    expect(() =>
      assertBrowserSafeStatusPayload({
        object: "verification_status",
        id: "vrf_test123",
        status: "verified",
        failure_code: "policy_not_satisfied",
      })
    ).toThrow("non-failed status response");
  });
});
