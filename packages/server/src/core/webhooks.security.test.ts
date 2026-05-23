import crypto from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { AuthboundClient } from "./client";
import { generateWebhookSignature } from "./webhooks";

const SECRET = "whsec_test_secret_key_12345";
const PAYLOAD = JSON.stringify({ type: "test.event", data: { id: "123" } });
const NOW_SECONDS = 1_718_452_800;

function signatureHeader(timestamp: number): string {
  const signature = crypto
    .createHmac("sha256", SECRET)
    .update(`${timestamp}.${PAYLOAD}`)
    .digest("hex");

  return `t=${timestamp},v1=${signature}`;
}

describe("WebhooksApi signature verification", () => {
  it("rejects future signatures beyond tight clock skew", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(NOW_SECONDS * 1000));

    try {
      const client = new AuthboundClient({ apiKey: "sk_test_123" });

      expect(
        client.webhooks.verifySignature({
          payload: PAYLOAD,
          signature: signatureHeader(NOW_SECONDS + 300),
          secret: SECRET,
        })
      ).toBe(false);
      expect(
        client.webhooks.verifySignature({
          payload: PAYLOAD,
          signature: signatureHeader(NOW_SECONDS + 5),
          secret: SECRET,
        })
      ).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it("rejects timestamps with trailing characters", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(NOW_SECONDS * 1000));

    try {
      const client = new AuthboundClient({ apiKey: "sk_test_123" });
      const signature = signatureHeader(NOW_SECONDS).split("v1=")[1];

      expect(
        client.webhooks.verifySignature({
          payload: PAYLOAD,
          signature: `t=${NOW_SECONDS}junk,v1=${signature}`,
          secret: SECRET,
        })
      ).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it("rejects duplicate timestamp fields", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(NOW_SECONDS * 1000));

    try {
      const client = new AuthboundClient({ apiKey: "sk_test_123" });
      const signature = signatureHeader(NOW_SECONDS).split("v1=")[1];

      expect(
        client.webhooks.verifySignature({
          payload: PAYLOAD,
          signature: `t=${NOW_SECONDS},t=${NOW_SECONDS + 1},v1=${signature}`,
          secret: SECRET,
        })
      ).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it("accepts rotation-style headers when any v1 signature matches", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(NOW_SECONDS * 1000));

    try {
      const client = new AuthboundClient({ apiKey: "sk_test_123" });
      const signature = signatureHeader(NOW_SECONDS).split("v1=")[1];

      expect(
        client.webhooks.verifySignature({
          payload: PAYLOAD,
          signature: `t=${NOW_SECONDS},v1=${"0".repeat(64)},v1=${signature}`,
          secret: SECRET,
        })
      ).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it("accepts signature headers with whitespace between parts", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(NOW_SECONDS * 1000));

    try {
      const client = new AuthboundClient({ apiKey: "sk_test_123" });
      const signature = signatureHeader(NOW_SECONDS).split("v1=")[1];

      expect(
        client.webhooks.verifySignature({
          payload: PAYLOAD,
          signature: `t=${NOW_SECONDS}, v1=${signature}`,
          secret: SECRET,
        })
      ).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it("rejects empty verifier inputs consistently with the canonical webhook verifier", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(NOW_SECONDS * 1000));

    try {
      const client = new AuthboundClient({ apiKey: "sk_test_123" });
      const emptyPayloadSignature = generateWebhookSignature({
        payload: "",
        secret: SECRET,
        timestamp: NOW_SECONDS,
      }).signature;
      const emptySecretSignature = generateWebhookSignature({
        payload: PAYLOAD,
        secret: "",
        timestamp: NOW_SECONDS,
      }).signature;

      expect(
        client.webhooks.verifySignature({
          payload: "",
          signature: emptyPayloadSignature,
          secret: SECRET,
        })
      ).toBe(false);
      expect(
        client.webhooks.verifySignature({
          payload: PAYLOAD,
          signature: emptySecretSignature,
          secret: "",
        })
      ).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });
});
