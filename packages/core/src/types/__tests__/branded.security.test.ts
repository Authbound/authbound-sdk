/**
 * Security tests for branded type validation.
 *
 * Target: isSessionId() in branded.ts:129-133
 * Purpose: Prevent path traversal and injection attacks via session IDs
 */

import { describe, expect, it } from "vitest";
import { isPolicyId, isSessionId } from "../branded";

describe("isSessionId - Path Traversal Prevention", () => {
  describe("Attack Prevention", () => {
    it("rejects parent directory traversal (../)", () => {
      expect(isSessionId("ses_../admin")).toBe(false);
      expect(isSessionId("ses_..")).toBe(false);
    });

    it("rejects deep directory traversal (../../)", () => {
      expect(isSessionId("ses_../../etc/passwd")).toBe(false);
      expect(isSessionId("ses_../../../root")).toBe(false);
    });

    it("rejects forward slash injection (/)", () => {
      expect(isSessionId("ses_abc/status")).toBe(false);
      expect(isSessionId("ses_/etc/passwd")).toBe(false);
    });

    it("rejects query parameter injection (?)", () => {
      expect(isSessionId("ses_abc?admin=true")).toBe(false);
      expect(isSessionId("ses_valid?query=1&role=admin")).toBe(false);
    });

    it("rejects null byte injection (\\0)", () => {
      expect(isSessionId("ses_abc\0admin")).toBe(false);
      expect(isSessionId("ses_valid\0.json")).toBe(false);
    });

    it("rejects newline injection for HTTP header attacks", () => {
      expect(isSessionId("ses_abc\nHost: evil.com")).toBe(false);
      expect(isSessionId("ses_abc\r\nX-Injected: true")).toBe(false);
    });

    it("rejects URL-encoded traversal attempts", () => {
      // These should fail because % is not in allowed charset
      expect(isSessionId("ses_..%2F..%2Fadmin")).toBe(false);
      expect(isSessionId("ses_%2e%2e/admin")).toBe(false);
    });
  });

  describe("Valid Session IDs", () => {
    it("accepts standard ULID format", () => {
      expect(isSessionId("ses_01HX7Y8K3M4P6N8B9C1D2F3G4H")).toBe(true);
      expect(isSessionId("ses_01ARZ3NDEKTSV4RRFFQ69G5FAV")).toBe(true);
    });

    it("accepts IDs with allowed special characters (hyphen, underscore)", () => {
      expect(isSessionId("ses_abc-123")).toBe(true);
      expect(isSessionId("ses_abc_123")).toBe(true);
      expect(isSessionId("ses_a-b_c-d_e")).toBe(true);
    });

    it("accepts mixed case alphanumeric", () => {
      expect(isSessionId("ses_AbCdEf123")).toBe(true);
      expect(isSessionId("ses_ABC")).toBe(true);
      expect(isSessionId("ses_abc")).toBe(true);
    });
  });

  describe("Edge Cases", () => {
    it("rejects empty string after prefix", () => {
      expect(isSessionId("ses_")).toBe(false);
    });

    it("rejects missing prefix", () => {
      expect(isSessionId("01HX7Y8K3M")).toBe(false);
      expect(isSessionId("abc123")).toBe(false);
    });

    it("rejects wrong prefix", () => {
      expect(isSessionId("session_abc123")).toBe(false);
      expect(isSessionId("SES_abc123")).toBe(false);
    });
  });
});

describe("isPolicyId - Format Validation", () => {
  describe("Valid Policy IDs", () => {
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
    it("rejects missing version", () => {
      expect(isPolicyId("age-gate")).toBe(false);
      expect(isPolicyId("age-gate@")).toBe(false);
    });

    it("rejects missing name", () => {
      expect(isPolicyId("@1.0.0")).toBe(false);
    });

    it("rejects invalid semver", () => {
      expect(isPolicyId("age-gate@1.0")).toBe(false);
      expect(isPolicyId("age-gate@1")).toBe(false);
      expect(isPolicyId("age-gate@latest")).toBe(false);
    });
  });
});
