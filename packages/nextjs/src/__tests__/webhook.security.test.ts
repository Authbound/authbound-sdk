/**
 * Security tests for webhook signature verification.
 *
 * Target: verifyWebhookSignatureDetailed() re-exported from @authbound-sdk/server
 * Purpose: Prevent webhook replay attacks via future timestamps
 *          (attacker sends webhook with future timestamp, replays later)
 */

import crypto from "crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { verifyWebhookSignatureDetailed } from "../server";

// Test constants
const SECRET = "whsec_test_secret_key_12345";
const PAYLOAD = JSON.stringify({ type: "test.event", data: { id: "123" } });

/**
 * Generate a valid signature for a payload at a specific timestamp.
 */
function generateSignature(
  payload: string,
  timestamp: number,
  secret: string
): string {
  const signedPayload = `${timestamp}.${payload}`;
  return crypto
    .createHmac("sha256", secret)
    .update(signedPayload)
    .digest("hex");
}

/**
 * Create a properly formatted signature header.
 */
function createSignatureHeader(timestamp: number, signature: string): string {
  return `t=${timestamp},v1=${signature}`;
}

function verify(payload: string, header: string, secret: string, tolerance?: number) {
  return verifyWebhookSignatureDetailed({
    payload,
    signature: header,
    secret,
    tolerance,
  });
}

describe("verifyWebhookSignature - Replay Attack Prevention", () => {
  // Fix "now" to a known timestamp for predictable testing
  const NOW_SECONDS = 1_718_452_800; // June 15, 2024 12:00:00 UTC

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(NOW_SECONDS * 1000));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("Future Timestamps - Must Reject", () => {
    it("rejects timestamp 10 minutes in the future (replay attack vector)", () => {
      const futureTimestamp = NOW_SECONDS + 600; // +10 min
      const signature = generateSignature(PAYLOAD, futureTimestamp, SECRET);
      const header = createSignatureHeader(futureTimestamp, signature);

      const result = verify(PAYLOAD, header, SECRET);

      expect(result.valid).toBe(false);
      expect(result.error).toContain("tolerance");
    });

    it("rejects timestamp at boundary + 1 second (tolerance=300s)", () => {
      const futureTimestamp = NOW_SECONDS + 301; // Just past 5 min tolerance
      const signature = generateSignature(PAYLOAD, futureTimestamp, SECRET);
      const header = createSignatureHeader(futureTimestamp, signature);

      const result = verify(PAYLOAD, header, SECRET);

      expect(result.valid).toBe(false);
    });

    it("accepts timestamp exactly at future boundary (tolerance=300s)", () => {
      const futureTimestamp = NOW_SECONDS + 300; // Exactly at 5 min tolerance
      const signature = generateSignature(PAYLOAD, futureTimestamp, SECRET);
      const header = createSignatureHeader(futureTimestamp, signature);

      const result = verify(PAYLOAD, header, SECRET);

      expect(result.valid).toBe(true);
    });
  });

  describe("Past Timestamps - Must Reject", () => {
    it("rejects timestamp 10 minutes in the past (standard replay)", () => {
      const pastTimestamp = NOW_SECONDS - 600; // -10 min
      const signature = generateSignature(PAYLOAD, pastTimestamp, SECRET);
      const header = createSignatureHeader(pastTimestamp, signature);

      const result = verify(PAYLOAD, header, SECRET);

      expect(result.valid).toBe(false);
      expect(result.error).toContain("tolerance");
    });

    it("rejects timestamp at boundary - 1 second (tolerance=300s)", () => {
      const pastTimestamp = NOW_SECONDS - 301; // Just past 5 min tolerance
      const signature = generateSignature(PAYLOAD, pastTimestamp, SECRET);
      const header = createSignatureHeader(pastTimestamp, signature);

      const result = verify(PAYLOAD, header, SECRET);

      expect(result.valid).toBe(false);
    });

    it("accepts timestamp exactly at past boundary (tolerance=300s)", () => {
      const pastTimestamp = NOW_SECONDS - 300; // Exactly at 5 min tolerance
      const signature = generateSignature(PAYLOAD, pastTimestamp, SECRET);
      const header = createSignatureHeader(pastTimestamp, signature);

      const result = verify(PAYLOAD, header, SECRET);

      expect(result.valid).toBe(true);
    });
  });

  describe("Valid Webhooks", () => {
    it("accepts current timestamp with valid signature", () => {
      const signature = generateSignature(PAYLOAD, NOW_SECONDS, SECRET);
      const header = createSignatureHeader(NOW_SECONDS, signature);

      const result = verify(PAYLOAD, header, SECRET);

      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it("rejects valid timestamp with wrong signature", () => {
      const header = createSignatureHeader(NOW_SECONDS, "invalid_signature");

      const result = verify(PAYLOAD, header, SECRET);

      expect(result.valid).toBe(false);
    });
  });

  describe("Custom Tolerance", () => {
    it("respects custom tolerance value", () => {
      // With tolerance=60, timestamp at -61s should be rejected
      const pastTimestamp = NOW_SECONDS - 61;
      const signature = generateSignature(PAYLOAD, pastTimestamp, SECRET);
      const header = createSignatureHeader(pastTimestamp, signature);

      const result = verify(PAYLOAD, header, SECRET, 60);

      expect(result.valid).toBe(false);
    });

    it("accepts timestamp within custom tolerance", () => {
      // With tolerance=600, timestamp at -500s should be accepted
      const pastTimestamp = NOW_SECONDS - 500;
      const signature = generateSignature(PAYLOAD, pastTimestamp, SECRET);
      const header = createSignatureHeader(pastTimestamp, signature);

      const result = verify(PAYLOAD, header, SECRET, 600);

      expect(result.valid).toBe(true);
    });
  });

  describe("Invalid Header Format", () => {
    it("rejects missing timestamp", () => {
      const result = verify(PAYLOAD, "v1=somesig", SECRET);

      expect(result.valid).toBe(false);
      expect(result.error).toContain("timestamp");
    });

    it("rejects missing signature", () => {
      const result = verify(PAYLOAD, `t=${NOW_SECONDS}`, SECRET);

      expect(result.valid).toBe(false);
      expect(result.error).toContain("signature");
    });
  });
});
