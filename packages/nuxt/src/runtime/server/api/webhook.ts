/**
 * Webhook API Route for Nuxt
 *
 * Handles webhook events from Authbound.
 */

import crypto from "crypto";
import { createError, defineEventHandler, getHeader, readRawBody } from "h3";
import { useRuntimeConfig } from "nuxt/app";

// ============================================================================
// Webhook Signature Verification
// ============================================================================

/**
 * Parse the Authbound webhook signature header.
 * Format: "t=<timestamp>,v1=<signature>"
 */
function parseSignatureHeader(
  header: string
): { timestamp: number; signatures: string[] } | null {
  const parts = header.split(",");
  let timestamp = 0;
  const signatures: string[] = [];

  for (const part of parts) {
    const [key, value] = part.split("=");
    if (key === "t") {
      timestamp = Number.parseInt(value, 10);
      if (isNaN(timestamp)) {
        return null;
      }
    } else if (key === "v1") {
      signatures.push(value);
    }
  }

  if (timestamp === 0 || signatures.length === 0) {
    return null;
  }

  return { timestamp, signatures };
}

/**
 * Compute the expected signature for a webhook payload.
 * Uses HMAC-SHA256 with format: "timestamp.payload"
 */
function computeSignature(
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
 * Compare signatures in constant time to prevent timing attacks.
 */
function secureCompare(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;
  }
  return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

/**
 * Verify a webhook signature.
 */
function verifyWebhookSignature(
  payload: string,
  signatureHeader: string,
  secret: string,
  tolerance = 300
): { isValid: boolean; error?: string } {
  const parsed = parseSignatureHeader(signatureHeader);

  if (!parsed) {
    return { isValid: false, error: "Invalid signature header format" };
  }

  const { timestamp, signatures } = parsed;

  // Check timestamp tolerance (both past AND future to prevent replay attacks)
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - timestamp) > tolerance) {
    return {
      isValid: false,
      error: "Timestamp outside tolerance window (possible replay attack)",
    };
  }

  // Compute expected signature
  const expected = computeSignature(payload, timestamp, secret);

  // Check if any of the provided signatures match
  const isValid = signatures.some((sig) => secureCompare(expected, sig));

  if (!isValid) {
    return { isValid: false, error: "Signature mismatch" };
  }

  return { isValid: true };
}

function getWebhookObjectId(body: Record<string, unknown>): string | undefined {
  const data = body.data;
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    return undefined;
  }

  const object = (data as Record<string, unknown>).object;
  if (!object || typeof object !== "object" || Array.isArray(object)) {
    return undefined;
  }

  const id = (object as Record<string, unknown>).id;
  return typeof id === "string" ? id : undefined;
}

// ============================================================================
// Webhook Handler
// ============================================================================

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig();
  const webhookSecret =
    config.authbound?.webhookSecret ?? process.env.AUTHBOUND_WEBHOOK_SECRET;
  const tolerance = config.authbound?.webhookTolerance ?? 300;
  const debug = config.public.authbound?.debug ?? false;

  // Get raw body for signature verification
  const rawBody = await readRawBody(event);
  if (!rawBody) {
    throw createError({
      statusCode: 400,
      message: "Empty request body",
    });
  }

  // Verify signature if secret is configured
  if (webhookSecret) {
    const signature = getHeader(event, "x-authbound-signature");
    if (!signature) {
      if (debug) {
        console.error("[Authbound] Webhook missing signature header");
      }
      throw createError({
        statusCode: 401,
        message: "Missing webhook signature",
      });
    }

    // Verify HMAC signature with timestamp tolerance
    const verification = verifyWebhookSignature(
      rawBody,
      signature,
      webhookSecret,
      tolerance
    );
    if (!verification.isValid) {
      if (debug) {
        console.error(
          "[Authbound] Webhook signature verification failed:",
          verification.error
        );
      }
      throw createError({
        statusCode: 401,
        message: verification.error || "Invalid signature",
      });
    }
  } else if (debug) {
    console.warn(
      "[Authbound] No webhook secret configured. " +
        "Set AUTHBOUND_WEBHOOK_SECRET to enable signature verification."
    );
  }

  let body: Record<string, unknown>;
  try {
    body = JSON.parse(rawBody) as Record<string, unknown>;
  } catch {
    throw createError({
      statusCode: 400,
      message: "Invalid JSON payload",
    });
  }

  const eventType = typeof body.type === "string" ? body.type : undefined;
  const objectId = getWebhookObjectId(body);

  if (debug) {
    console.log("[Authbound] Webhook event received:", {
      type: eventType,
      objectId,
    });
  }

  // Handle event types
  switch (eventType) {
    case "identity.verification_session.verified":
      if (debug) {
        console.log("[Authbound] Verification verified:", objectId);
      }
      // Emit event for application to handle
      // Developers can use Nuxt's hooks to listen for these
      break;

    case "identity.verification_session.failed":
      if (debug) {
        console.log("[Authbound] Verification failed:", objectId);
      }
      break;
  }

  return { received: true };
});
