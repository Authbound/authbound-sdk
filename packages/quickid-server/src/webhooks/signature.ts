/**
 * Webhook signature verification utilities
 *
 * Stripe-compatible HMAC-SHA256 signature format:
 * Header: Authbound-Signature: t=1700000000,v1=<hex_hmac>
 * Signed payload: "{timestamp}.{rawBody}"
 */

import { createHmac, timingSafeEqual } from "node:crypto";
import type { ParsedSignatureHeader } from "@authbound-sdk/quickid-core";
import { QuickIDSignatureVerificationError } from "../errors";

/** Default tolerance for timestamp verification (5 minutes) */
const DEFAULT_TOLERANCE_SECONDS = 300;

/**
 * Sign a webhook payload (useful for testing)
 *
 * @param secret - Webhook secret
 * @param timestamp - Unix timestamp
 * @param rawBody - Raw JSON body string
 * @returns Hex-encoded HMAC-SHA256 signature
 */
export function signPayload(
  secret: string,
  timestamp: number,
  rawBody: string
): string {
  const signedPayload = `${timestamp}.${rawBody}`;
  return createHmac("sha256", secret).update(signedPayload).digest("hex");
}

/**
 * Generate a complete signature header for testing
 *
 * @param secret - Webhook secret
 * @param rawBody - Raw JSON body string
 * @param timestamp - Optional Unix timestamp (defaults to current time)
 * @returns Complete signature header value (e.g., "t=1700000000,v1=abc123...")
 */
export function generateSignatureHeader(
  secret: string,
  rawBody: string,
  timestamp?: number
): string {
  const ts = timestamp ?? Math.floor(Date.now() / 1000);
  const signature = signPayload(secret, ts, rawBody);
  return `t=${ts},v1=${signature}`;
}

/**
 * Parse the Authbound-Signature header
 *
 * Format: t=1700000000,v1=<hex_hmac>,v1=<hex_hmac2>
 * Multiple v1 signatures are supported for key rotation
 *
 * @param header - Raw signature header value
 * @returns Parsed timestamp and signatures, or null if invalid
 */
export function parseSignatureHeader(
  header: string
): ParsedSignatureHeader | null {
  const parts = header.split(",");
  let timestamp: number | null = null;
  const signatures: string[] = [];

  for (const part of parts) {
    const eqIdx = part.indexOf("=");
    if (eqIdx === -1) continue;

    const key = part.slice(0, eqIdx).trim();
    const value = part.slice(eqIdx + 1).trim();
    if (!(key && value)) continue;

    if (key === "t") {
      const t = Number.parseInt(value, 10);
      if (Number.isFinite(t)) {
        timestamp = t;
      }
    } else if (key === "v1" && value.length <= 256) {
      // DoS guard: ignore absurdly long signatures
      signatures.push(value);
    }
  }

  if (timestamp === null || signatures.length === 0) {
    return null;
  }

  return { timestamp, signatures };
}

/**
 * Verify webhook signature
 *
 * @param secret - Webhook secret
 * @param rawBody - Raw request body (string or Buffer)
 * @param signatureHeader - Value of Authbound-Signature header
 * @param toleranceSeconds - Maximum age of signature in seconds (default: 300)
 * @returns true if signature is valid
 */
export function verifySignature(
  secret: string,
  rawBody: string | Buffer,
  signatureHeader: string,
  toleranceSeconds = DEFAULT_TOLERANCE_SECONDS
): boolean {
  const body = typeof rawBody === "string" ? rawBody : rawBody.toString("utf8");

  const parsed = parseSignatureHeader(signatureHeader);
  if (!parsed) {
    return false;
  }

  const { timestamp, signatures } = parsed;

  // Validate timestamp is finite and non-negative
  if (!Number.isFinite(timestamp) || timestamp < 0) {
    return false;
  }

  // Check timestamp tolerance (prevent replay attacks)
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - timestamp) > toleranceSeconds) {
    return false;
  }

  // Compute expected signature
  const expectedSig = signPayload(secret, timestamp, body);
  const expectedBuffer = Buffer.from(expectedSig, "hex");

  // Verify against ANY candidate signature (supports key rotation)
  for (const sig of signatures) {
    try {
      const sigBuffer = Buffer.from(sig, "hex");

      // Length mismatch: can't be equal
      if (sigBuffer.length !== expectedBuffer.length) {
        continue;
      }

      // Constant-time comparison to prevent timing attacks
      if (timingSafeEqual(sigBuffer, expectedBuffer)) {
        return true;
      }
    } catch {
      // Invalid hex → ignore and try next signature
    }
  }

  return false;
}

/**
 * Construct and verify a webhook event
 *
 * @param rawBody - Raw request body (string or Buffer)
 * @param signatureHeader - Value of Authbound-Signature header
 * @param secret - Webhook secret
 * @param parse - Function to parse the body into the event type
 * @param toleranceSeconds - Maximum age of signature in seconds (default: 300)
 * @returns Parsed event if signature is valid
 * @throws QuickIDSignatureVerificationError if signature is invalid
 */
export function constructEvent<T>(
  rawBody: string | Buffer,
  signatureHeader: string,
  secret: string,
  parse: (body: string) => T,
  toleranceSeconds = DEFAULT_TOLERANCE_SECONDS
): T {
  if (!verifySignature(secret, rawBody, signatureHeader, toleranceSeconds)) {
    throw new QuickIDSignatureVerificationError();
  }

  const body = typeof rawBody === "string" ? rawBody : rawBody.toString("utf8");
  return parse(body);
}
