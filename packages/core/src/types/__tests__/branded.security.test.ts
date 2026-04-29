/**
 * Security tests for branded type validation.
 *
 * Target: isVerificationId() in branded.ts
 * Purpose: Prevent path traversal and injection attacks via verification IDs
 */

import { describe, expect, it } from "vitest";
import { isPolicyId, isVerificationId } from "../branded";

describe("isVerificationId - Path Traversal Prevention", () => {
  describe("Attack Prevention", () => {
    it("rejects parent directory traversal (../)", () => {
      expect(isVerificationId("vrf_../admin")).toBe(false);
      expect(isVerificationId("vrf_..")).toBe(false);
    });

    it("rejects deep directory traversal (../../)", () => {
      expect(isVerificationId("vrf_../../etc/passwd")).toBe(false);
      expect(isVerificationId("vrf_../../../root")).toBe(false);
    });

    it("rejects forward slash injection (/)", () => {
      expect(isVerificationId("vrf_abc/status")).toBe(false);
      expect(isVerificationId("vrf_/etc/passwd")).toBe(false);
    });

    it("rejects query parameter injection (?)", () => {
      expect(isVerificationId("vrf_abc?admin=true")).toBe(false);
      expect(isVerificationId("vrf_valid?query=1&role=admin")).toBe(false);
    });

    it("rejects null byte injection (\\0)", () => {
      expect(isVerificationId("vrf_abc\0admin")).toBe(false);
      expect(isVerificationId("vrf_valid\0.json")).toBe(false);
    });

    it("rejects newline injection for HTTP header attacks", () => {
      expect(isVerificationId("vrf_abc\nHost: evil.com")).toBe(false);
      expect(isVerificationId("vrf_abc\r\nX-Injected: true")).toBe(false);
    });

    it("rejects URL-encoded traversal attempts", () => {
      // These should fail because % is not in allowed charset
      expect(isVerificationId("vrf_..%2F..%2Fadmin")).toBe(false);
      expect(isVerificationId("vrf_%2e%2e/admin")).toBe(false);
    });
  });

  describe("Valid Verification IDs", () => {
    it("accepts public vrf-prefixed IDs", () => {
      expect(isVerificationId("vrf_01HX7Y8K3M4P6N8B9C1D2F3G4H")).toBe(true);
      expect(isVerificationId("vrf_01ARZ3NDEKTSV4RRFFQ69G5FAV")).toBe(true);
    });

    it("accepts UUID verification IDs returned by Gateway", () => {
      expect(isVerificationId("00000000-0000-4000-8000-000000000123")).toBe(
        true
      );
    });

    it("accepts IDs with allowed special characters (hyphen, underscore)", () => {
      expect(isVerificationId("vrf_abc-123")).toBe(true);
      expect(isVerificationId("vrf_abc_123")).toBe(true);
      expect(isVerificationId("vrf_a-b_c-d_e")).toBe(true);
    });

    it("accepts mixed case alphanumeric", () => {
      expect(isVerificationId("vrf_AbCdEf123")).toBe(true);
      expect(isVerificationId("vrf_ABC")).toBe(true);
      expect(isVerificationId("vrf_abc")).toBe(true);
    });
  });

  describe("Edge Cases", () => {
    it("rejects empty string after prefix", () => {
      expect(isVerificationId("vrf_")).toBe(false);
    });

    it("rejects unprefixed non-UUID values", () => {
      expect(isVerificationId("01HX7Y8K3M")).toBe(false);
      expect(isVerificationId("abc123")).toBe(false);
    });

    it("rejects old session and wrong verification prefixes", () => {
      expect(isVerificationId("ses_abc123")).toBe(false);
      expect(isVerificationId("verification_abc123")).toBe(false);
      expect(isVerificationId("VRF_abc123")).toBe(false);
    });
  });
});

describe("isPolicyId - Format Validation", () => {
  describe("Valid Policy IDs", () => {
    it("accepts seeded v1 policy IDs without semantic suffixes", () => {
      expect(isPolicyId("pol_authbound_pension_v1")).toBe(true);
      expect(isPolicyId("pol_age_over_18_v1")).toBe(true);
    });

    it("accepts standard name@version format", () => {
      expect(isPolicyId("age-gate-18@1.0.0")).toBe(true);
      expect(isPolicyId("kyc-full@2.1.0")).toBe(true);
    });

    it("accepts version with v prefix", () => {
      expect(isPolicyId("age-gate@v1.0.0")).toBe(true);
    });

    it("accepts pre-release versions", () => {
      expect(isPolicyId("test-policy@1.0.0-beta.1")).toBe(true);
      expect(isPolicyId("test-policy@1.0.0-rc.2")).toBe(true);
    });
  });

  describe("Invalid Policy IDs", () => {
    it("rejects invalid characters", () => {
      expect(isPolicyId("../age-gate")).toBe(false);
      expect(isPolicyId("age-gate?admin=true")).toBe(false);
      expect(isPolicyId("age gate")).toBe(false);
    });

    it("rejects missing name around version separator", () => {
      expect(isPolicyId("@1.0.0")).toBe(false);
      expect(isPolicyId("age-gate@")).toBe(false);
    });

    it("rejects invalid semver", () => {
      expect(isPolicyId("age-gate@1.0")).toBe(false);
      expect(isPolicyId("age-gate@1")).toBe(false);
      expect(isPolicyId("age-gate@latest")).toBe(false);
    });
  });
});
