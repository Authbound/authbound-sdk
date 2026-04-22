import { describe, expect, it } from "vitest";
import { isVerificationFailureStatus } from "./useVerification";

describe("useVerification status classification", () => {
  it("treats canceled and expired as terminal failure states", () => {
    expect(isVerificationFailureStatus("failed")).toBe(true);
    expect(isVerificationFailureStatus("error")).toBe(true);
    expect(isVerificationFailureStatus("canceled")).toBe(true);
    expect(isVerificationFailureStatus("expired")).toBe(true);
    expect(isVerificationFailureStatus("timeout")).toBe(true);
    expect(isVerificationFailureStatus("verified")).toBe(false);
    expect(isVerificationFailureStatus("pending")).toBe(false);
  });
});
