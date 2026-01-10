/**
 * Tests for webhook signature verification
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { QuickIDSignatureVerificationError } from "../errors";
import {
  constructEvent,
  generateSignatureHeader,
  parseSignatureHeader,
  signPayload,
  verifySignature,
} from "../webhooks/signature";

describe("Webhook Signature", () => {
  const SECRET = "whsec_test_secret_key_1234567890";
  const PAYLOAD =
    '{"id":"evt_123","type":"identity.verification_session.verified"}';
  const TIMESTAMP = 1_700_000_000;

  describe("signPayload", () => {
    it("generates consistent HMAC-SHA256 signature", () => {
      const sig1 = signPayload(SECRET, TIMESTAMP, PAYLOAD);
      const sig2 = signPayload(SECRET, TIMESTAMP, PAYLOAD);

      expect(sig1).toBe(sig2);
      expect(sig1).toHaveLength(64); // SHA-256 produces 32 bytes = 64 hex chars
    });

    it("produces different signatures for different payloads", () => {
      const sig1 = signPayload(SECRET, TIMESTAMP, PAYLOAD);
      const sig2 = signPayload(SECRET, TIMESTAMP, '{"different":"payload"}');

      expect(sig1).not.toBe(sig2);
    });

    it("produces different signatures for different timestamps", () => {
      const sig1 = signPayload(SECRET, TIMESTAMP, PAYLOAD);
      const sig2 = signPayload(SECRET, TIMESTAMP + 1, PAYLOAD);

      expect(sig1).not.toBe(sig2);
    });

    it("produces different signatures for different secrets", () => {
      const sig1 = signPayload(SECRET, TIMESTAMP, PAYLOAD);
      const sig2 = signPayload("different_secret", TIMESTAMP, PAYLOAD);

      expect(sig1).not.toBe(sig2);
    });

    it("matches expected signature format", () => {
      const sig = signPayload(SECRET, TIMESTAMP, PAYLOAD);

      // Should be valid hex
      expect(sig).toMatch(/^[0-9a-f]{64}$/);
    });
  });

  describe("generateSignatureHeader", () => {
    it("generates valid header format", () => {
      const header = generateSignatureHeader(SECRET, PAYLOAD, TIMESTAMP);

      expect(header).toMatch(/^t=\d+,v1=[0-9a-f]{64}$/);
      expect(header).toContain(`t=${TIMESTAMP}`);
    });

    it("uses current time when timestamp not provided", () => {
      const before = Math.floor(Date.now() / 1000);
      const header = generateSignatureHeader(SECRET, PAYLOAD);
      const after = Math.floor(Date.now() / 1000);

      const parsed = parseSignatureHeader(header);
      expect(parsed).not.toBeNull();
      expect(parsed!.timestamp).toBeGreaterThanOrEqual(before);
      expect(parsed!.timestamp).toBeLessThanOrEqual(after);
    });
  });

  describe("parseSignatureHeader", () => {
    it("parses valid header", () => {
      const header = "t=1700000000,v1=abc123def456";
      const parsed = parseSignatureHeader(header);

      expect(parsed).toEqual({
        timestamp: 1_700_000_000,
        signatures: ["abc123def456"],
      });
    });

    it("handles multiple v1 signatures (key rotation)", () => {
      const header = "t=1700000000,v1=sig1,v1=sig2,v1=sig3";
      const parsed = parseSignatureHeader(header);

      expect(parsed).toEqual({
        timestamp: 1_700_000_000,
        signatures: ["sig1", "sig2", "sig3"],
      });
    });

    it("handles whitespace", () => {
      const header = "t = 1700000000 , v1 = abc123";
      const parsed = parseSignatureHeader(header);

      expect(parsed).toEqual({
        timestamp: 1_700_000_000,
        signatures: ["abc123"],
      });
    });

    it("returns null for missing timestamp", () => {
      const header = "v1=abc123";
      const parsed = parseSignatureHeader(header);

      expect(parsed).toBeNull();
    });

    it("returns null for missing signature", () => {
      const header = "t=1700000000";
      const parsed = parseSignatureHeader(header);

      expect(parsed).toBeNull();
    });

    it("returns null for empty header", () => {
      expect(parseSignatureHeader("")).toBeNull();
    });

    it("returns null for invalid format", () => {
      expect(parseSignatureHeader("invalid")).toBeNull();
      expect(parseSignatureHeader("t=notanumber,v1=sig")).toBeNull();
    });

    it("ignores unknown keys", () => {
      const header = "t=1700000000,v2=ignored,v1=sig,unknown=value";
      const parsed = parseSignatureHeader(header);

      expect(parsed).toEqual({
        timestamp: 1_700_000_000,
        signatures: ["sig"],
      });
    });

    it("ignores absurdly long signatures (DoS protection)", () => {
      const longSig = "a".repeat(257);
      const header = `t=1700000000,v1=${longSig},v1=valid`;
      const parsed = parseSignatureHeader(header);

      expect(parsed).toEqual({
        timestamp: 1_700_000_000,
        signatures: ["valid"], // Long signature ignored
      });
    });

    it("uses last timestamp if multiple provided", () => {
      const header = "t=1000,t=2000,v1=sig";
      const parsed = parseSignatureHeader(header);

      expect(parsed?.timestamp).toBe(2000);
    });
  });

  describe("verifySignature", () => {
    beforeEach(() => {
      // Mock Date.now to return a fixed time
      vi.useFakeTimers();
      vi.setSystemTime(new Date(TIMESTAMP * 1000));
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("verifies valid signature", () => {
      const header = generateSignatureHeader(SECRET, PAYLOAD, TIMESTAMP);

      expect(verifySignature(SECRET, PAYLOAD, header)).toBe(true);
    });

    it("verifies signature with Buffer body", () => {
      const header = generateSignatureHeader(SECRET, PAYLOAD, TIMESTAMP);
      const bufferBody = Buffer.from(PAYLOAD, "utf8");

      expect(verifySignature(SECRET, bufferBody, header)).toBe(true);
    });

    it("rejects wrong secret", () => {
      const header = generateSignatureHeader(SECRET, PAYLOAD, TIMESTAMP);

      expect(verifySignature("wrong_secret", PAYLOAD, header)).toBe(false);
    });

    it("rejects tampered payload", () => {
      const header = generateSignatureHeader(SECRET, PAYLOAD, TIMESTAMP);

      expect(verifySignature(SECRET, '{"tampered":"payload"}', header)).toBe(
        false
      );
    });

    it("rejects expired signature (timestamp too old)", () => {
      // Create signature from 10 minutes ago
      const oldTimestamp = TIMESTAMP - 600;
      const header = generateSignatureHeader(SECRET, PAYLOAD, oldTimestamp);

      // Default tolerance is 300 seconds (5 minutes)
      expect(verifySignature(SECRET, PAYLOAD, header)).toBe(false);
    });

    it("rejects future signature (timestamp too far ahead)", () => {
      // Create signature 10 minutes in the future
      const futureTimestamp = TIMESTAMP + 600;
      const header = generateSignatureHeader(SECRET, PAYLOAD, futureTimestamp);

      expect(verifySignature(SECRET, PAYLOAD, header)).toBe(false);
    });

    it("accepts signature within tolerance", () => {
      // Create signature from 4 minutes ago (within 5 minute tolerance)
      const recentTimestamp = TIMESTAMP - 240;
      const header = generateSignatureHeader(SECRET, PAYLOAD, recentTimestamp);

      expect(verifySignature(SECRET, PAYLOAD, header)).toBe(true);
    });

    it("respects custom tolerance", () => {
      // Create signature from 10 minutes ago
      const oldTimestamp = TIMESTAMP - 600;
      const header = generateSignatureHeader(SECRET, PAYLOAD, oldTimestamp);

      // With 15 minute tolerance, should pass
      expect(verifySignature(SECRET, PAYLOAD, header, 900)).toBe(true);

      // With 5 minute tolerance (default), should fail
      expect(verifySignature(SECRET, PAYLOAD, header, 300)).toBe(false);
    });

    it("accepts any valid signature from multiple (key rotation)", () => {
      const sig1 = signPayload("old_secret", TIMESTAMP, PAYLOAD);
      const sig2 = signPayload(SECRET, TIMESTAMP, PAYLOAD);
      const header = `t=${TIMESTAMP},v1=${sig1},v1=${sig2}`;

      // Should pass because sig2 is valid
      expect(verifySignature(SECRET, PAYLOAD, header)).toBe(true);
    });

    it("rejects invalid header format", () => {
      expect(verifySignature(SECRET, PAYLOAD, "invalid")).toBe(false);
      expect(verifySignature(SECRET, PAYLOAD, "")).toBe(false);
    });

    it("rejects negative timestamp", () => {
      const header = "t=-1,v1=" + signPayload(SECRET, -1, PAYLOAD);

      expect(verifySignature(SECRET, PAYLOAD, header)).toBe(false);
    });

    it("handles invalid hex in signature gracefully", () => {
      const header = `t=${TIMESTAMP},v1=not_valid_hex,v1=${signPayload(SECRET, TIMESTAMP, PAYLOAD)}`;

      // Should still work because second signature is valid
      expect(verifySignature(SECRET, PAYLOAD, header)).toBe(true);
    });

    it("rejects all invalid signatures", () => {
      const header = `t=${TIMESTAMP},v1=invalid1,v1=invalid2`;

      expect(verifySignature(SECRET, PAYLOAD, header)).toBe(false);
    });
  });

  describe("constructEvent", () => {
    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date(TIMESTAMP * 1000));
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("returns parsed event for valid signature", () => {
      const header = generateSignatureHeader(SECRET, PAYLOAD, TIMESTAMP);
      const parse = (body: string) => JSON.parse(body);

      const event = constructEvent(PAYLOAD, header, SECRET, parse);

      expect(event).toEqual({
        id: "evt_123",
        type: "identity.verification_session.verified",
      });
    });

    it("works with Buffer body", () => {
      const header = generateSignatureHeader(SECRET, PAYLOAD, TIMESTAMP);
      const bufferBody = Buffer.from(PAYLOAD, "utf8");
      const parse = (body: string) => JSON.parse(body);

      const event = constructEvent(bufferBody, header, SECRET, parse);

      expect(event).toEqual({
        id: "evt_123",
        type: "identity.verification_session.verified",
      });
    });

    it("throws QuickIDSignatureVerificationError for invalid signature", () => {
      const header = generateSignatureHeader(
        "wrong_secret",
        PAYLOAD,
        TIMESTAMP
      );
      const parse = (body: string) => JSON.parse(body);

      expect(() => constructEvent(PAYLOAD, header, SECRET, parse)).toThrow(
        QuickIDSignatureVerificationError
      );
    });

    it("throws QuickIDSignatureVerificationError for expired signature", () => {
      const oldTimestamp = TIMESTAMP - 600;
      const header = generateSignatureHeader(SECRET, PAYLOAD, oldTimestamp);
      const parse = (body: string) => JSON.parse(body);

      expect(() => constructEvent(PAYLOAD, header, SECRET, parse)).toThrow(
        QuickIDSignatureVerificationError
      );
    });

    it("respects custom tolerance", () => {
      const oldTimestamp = TIMESTAMP - 600;
      const header = generateSignatureHeader(SECRET, PAYLOAD, oldTimestamp);
      const parse = (body: string) => JSON.parse(body);

      // With 15 minute tolerance, should pass
      const event = constructEvent(PAYLOAD, header, SECRET, parse, 900);
      expect(event).toBeDefined();
    });

    it("passes body string to parse function", () => {
      const header = generateSignatureHeader(SECRET, PAYLOAD, TIMESTAMP);
      const parse = vi.fn((body: string) => ({ raw: body }));

      constructEvent(PAYLOAD, header, SECRET, parse);

      expect(parse).toHaveBeenCalledWith(PAYLOAD);
    });

    it("propagates parse errors", () => {
      const header = generateSignatureHeader(SECRET, PAYLOAD, TIMESTAMP);
      const parse = () => {
        throw new Error("Parse failed");
      };

      expect(() => constructEvent(PAYLOAD, header, SECRET, parse)).toThrow(
        "Parse failed"
      );
    });
  });

  describe("Integration: Round-trip signing and verification", () => {
    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date(TIMESTAMP * 1000));
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("sign -> generate header -> verify works end-to-end", () => {
      const payload = JSON.stringify({
        id: "evt_test",
        object: "event",
        type: "identity.verification_session.verified",
        data: { object: { id: "vs_123", status: "verified" } },
      });

      // Sign and generate header
      const header = generateSignatureHeader(SECRET, payload);

      // Parse and verify
      const parsed = parseSignatureHeader(header);
      expect(parsed).not.toBeNull();

      const isValid = verifySignature(SECRET, payload, header);
      expect(isValid).toBe(true);

      // Construct event
      const event = constructEvent(payload, header, SECRET, JSON.parse);
      expect(event.id).toBe("evt_test");
      expect(event.type).toBe("identity.verification_session.verified");
    });

    it("handles special characters in payload", () => {
      const payload = JSON.stringify({
        message: 'Hello "World"! Special chars: <>&\'"',
        unicode: "日本語 emoji 🎉",
      });

      const header = generateSignatureHeader(SECRET, payload);
      expect(verifySignature(SECRET, payload, header)).toBe(true);
    });

    it("handles empty object payload", () => {
      const payload = "{}";

      const header = generateSignatureHeader(SECRET, payload);
      expect(verifySignature(SECRET, payload, header)).toBe(true);
    });

    it("handles large payload", () => {
      const payload = JSON.stringify({
        data: "x".repeat(100_000),
      });

      const header = generateSignatureHeader(SECRET, payload);
      expect(verifySignature(SECRET, payload, header)).toBe(true);
    });
  });
});
