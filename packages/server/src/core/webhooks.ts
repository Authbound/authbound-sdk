/**
 * Webhook signature verification utilities.
 *
 * Authbound signs webhook payloads using HMAC-SHA256 to ensure authenticity.
 * Always verify webhook signatures before processing events.
 *
 * @example
 * ```ts
 * import { verifyWebhookSignature } from '@authbound/server';
 *
 * app.post('/webhook', (req, res) => {
 *   const isValid = verifyWebhookSignature({
 *     payload: req.rawBody,
 *     signature: req.headers['x-authbound-signature'],
 *     secret: process.env.AUTHBOUND_WEBHOOK_SECRET!,
 *   });
 *
 *   if (!isValid) {
 *     return res.status(401).json({ error: 'Invalid signature' });
 *   }
 *
 *   // Process webhook...
 * });
 * ```
 */

// ============================================================================
// Types
// ============================================================================

export interface WebhookSignatureOptions {
  /**
   * Raw request body as string or Buffer.
   * IMPORTANT: This must be the raw body, not parsed JSON.
   */
  payload: string | Buffer;

  /**
   * Value of the X-Authbound-Signature header.
   * Format: "t=timestamp,v1=signature"
   */
  signature: string;

  /**
   * Your webhook secret from the Authbound dashboard.
   * Each webhook endpoint has a unique secret.
   */
  secret: string;

  /**
   * Maximum age of webhook in seconds.
   * Webhooks older than this are rejected to prevent replay attacks.
   * Defaults to 300 seconds (5 minutes).
   */
  tolerance?: number;
}

export interface WebhookSignatureResult {
  /**
   * Whether the signature is valid.
   */
  valid: boolean;

  /**
   * Error message if validation failed.
   */
  error?: string;

  /**
   * Timestamp from the signature header.
   */
  timestamp?: number;
}

// ============================================================================
// Signature Verification
// ============================================================================

/**
 * Verify an Authbound webhook signature.
 *
 * This function validates that a webhook was sent by Authbound and
 * hasn't been tampered with. It also checks for replay attacks by
 * validating the timestamp.
 *
 * @returns true if the signature is valid, false otherwise
 *
 * @example
 * ```ts
 * // Express with raw body
 * app.use('/webhook', express.raw({ type: 'application/json' }));
 *
 * app.post('/webhook', (req, res) => {
 *   const isValid = verifyWebhookSignature({
 *     payload: req.body,
 *     signature: req.headers['x-authbound-signature'] as string,
 *     secret: process.env.AUTHBOUND_WEBHOOK_SECRET!,
 *   });
 *
 *   if (!isValid) {
 *     return res.status(401).send('Invalid signature');
 *   }
 *
 *   const event = JSON.parse(req.body.toString());
 *   // Handle event...
 * });
 * ```
 *
 * @example
 * ```ts
 * // Hono
 * app.post('/webhook', async (c) => {
 *   const rawBody = await c.req.text();
 *   const signature = c.req.header('x-authbound-signature');
 *
 *   const isValid = verifyWebhookSignature({
 *     payload: rawBody,
 *     signature: signature || '',
 *     secret: process.env.AUTHBOUND_WEBHOOK_SECRET!,
 *   });
 *
 *   if (!isValid) {
 *     return c.json({ error: 'Invalid signature' }, 401);
 *   }
 *
 *   const event = JSON.parse(rawBody);
 *   // Handle event...
 * });
 * ```
 */
export function verifyWebhookSignature(
  options: WebhookSignatureOptions
): boolean {
  const result = verifyWebhookSignatureDetailed(options);
  return result.valid;
}

/**
 * Verify an Authbound webhook signature with detailed error information.
 *
 * Use this when you need to know why verification failed.
 *
 * @example
 * ```ts
 * const result = verifyWebhookSignatureDetailed({
 *   payload: rawBody,
 *   signature: signatureHeader,
 *   secret: webhookSecret,
 * });
 *
 * if (!result.valid) {
 *   console.error('Webhook verification failed:', result.error);
 *   return res.status(401).json({ error: result.error });
 * }
 * ```
 */
export function verifyWebhookSignatureDetailed(
  options: WebhookSignatureOptions
): WebhookSignatureResult {
  const crypto = require("crypto") as typeof import("crypto");

  const { payload, signature, secret, tolerance = 300 } = options;

  // Validate inputs
  if (!signature) {
    return { valid: false, error: "Missing signature header" };
  }

  if (!secret) {
    return { valid: false, error: "Missing webhook secret" };
  }

  if (!payload) {
    return { valid: false, error: "Missing payload" };
  }

  // Parse signature header: "t=timestamp,v1=signature"
  const parts = signature.split(",");
  const timestampPart = parts.find((p) => p.startsWith("t="));
  const signaturePart = parts.find((p) => p.startsWith("v1="));

  if (!timestampPart) {
    return { valid: false, error: "Missing timestamp in signature" };
  }

  if (!signaturePart) {
    return { valid: false, error: "Missing v1 signature" };
  }

  const timestamp = parseInt(timestampPart.slice(2), 10);
  const expectedSignature = signaturePart.slice(3);

  if (isNaN(timestamp)) {
    return { valid: false, error: "Invalid timestamp format" };
  }

  // Check timestamp is within tolerance
  const now = Math.floor(Date.now() / 1000);
  const age = Math.abs(now - timestamp);

  if (age > tolerance) {
    return {
      valid: false,
      error: `Webhook too old: ${age}s > ${tolerance}s tolerance`,
      timestamp,
    };
  }

  // Compute expected signature
  const payloadString =
    typeof payload === "string" ? payload : payload.toString("utf8");
  const signedPayload = `${timestamp}.${payloadString}`;

  const computedSignature = crypto
    .createHmac("sha256", secret)
    .update(signedPayload)
    .digest("hex");

  // Constant-time comparison to prevent timing attacks
  try {
    const signatureBuffer = Buffer.from(expectedSignature, "hex");
    const computedBuffer = Buffer.from(computedSignature, "hex");

    if (signatureBuffer.length !== computedBuffer.length) {
      return { valid: false, error: "Invalid signature length", timestamp };
    }

    const isValid = crypto.timingSafeEqual(signatureBuffer, computedBuffer);

    if (!isValid) {
      return { valid: false, error: "Signature mismatch", timestamp };
    }

    return { valid: true, timestamp };
  } catch {
    return { valid: false, error: "Signature comparison failed", timestamp };
  }
}

/**
 * Generate a webhook signature for testing purposes.
 *
 * This is useful for testing your webhook handlers locally.
 *
 * @example
 * ```ts
 * // In your test file
 * const { signature, timestamp } = generateWebhookSignature({
 *   payload: JSON.stringify(testEvent),
 *   secret: 'whsec_test_secret',
 * });
 *
 * const response = await fetch('/webhook', {
 *   method: 'POST',
 *   headers: {
 *     'Content-Type': 'application/json',
 *     'X-Authbound-Signature': signature,
 *   },
 *   body: JSON.stringify(testEvent),
 * });
 * ```
 */
export function generateWebhookSignature(options: {
  payload: string;
  secret: string;
  timestamp?: number;
}): { signature: string; timestamp: number } {
  const crypto = require("crypto") as typeof import("crypto");

  const { payload, secret, timestamp = Math.floor(Date.now() / 1000) } = options;

  const signedPayload = `${timestamp}.${payload}`;
  const hmac = crypto
    .createHmac("sha256", secret)
    .update(signedPayload)
    .digest("hex");

  return {
    signature: `t=${timestamp},v1=${hmac}`,
    timestamp,
  };
}
