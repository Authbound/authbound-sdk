import { describe, expect, it } from "vitest";
import {
  isTerminalVerificationProgressStatus,
  ProviderPreferenceSchema,
  projectVerificationStatusForUi,
  VerificationProgressStatusSchema,
} from "../verification-contract";

describe("public verification contract module", () => {
  it("defines the precise public progress statuses from OpenAPI separately from UI projection", () => {
    expect(VerificationProgressStatusSchema.options).toEqual([
      "created",
      "awaiting_user",
      "awaiting_provider",
      "pending",
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
    expect(ProviderPreferenceSchema.safeParse("vcs").success).toBe(true);
    expect(ProviderPreferenceSchema.safeParse("eudi").success).toBe(true);
    expect(ProviderPreferenceSchema.safeParse("reverify").success).toBe(false);
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
