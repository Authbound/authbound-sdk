/**
 * Webhook event types for QuickID
 * Compatible with Stripe Identity webhook event structure
 */

import { z } from "zod";
import { SessionResultSchema } from "./session-types";

// ============================================================================
// Webhook Event Types
// ============================================================================

/**
 * All webhook event types that QuickID can send
 */
export const WebhookEventTypeSchema = z.enum([
  /** Verification is being processed (documents submitted) */
  "identity.verification_session.processing",
  /** Verification completed successfully */
  "identity.verification_session.verified",
  /** Verification rejected - user can retry with new documents */
  "identity.verification_session.requires_input",
  /** Verification failed due to system error */
  "identity.verification_session.failed",
  /** User canceled the verification */
  "identity.verification_session.canceled",
  /** Session data has been redacted (GDPR deletion) */
  "identity.verification_session.redacted",
]);

export type WebhookEventType = z.infer<typeof WebhookEventTypeSchema>;

/**
 * All possible webhook event types as array (useful for webhook endpoint configuration)
 */
export const ALL_WEBHOOK_EVENT_TYPES: WebhookEventType[] =
  WebhookEventTypeSchema.options;

/**
 * Current API version for webhooks
 */
export const WEBHOOK_API_VERSION = "2026-01-01" as const;

/**
 * Complete webhook event object
 */
export const WebhookEventSchema = z.object({
  /** Unique event ID (e.g., "evt_01HX...") */
  id: z.string(),
  /** Object type - always "event" */
  object: z.literal("event"),
  /** API version this event was generated with */
  api_version: z.literal(WEBHOOK_API_VERSION),
  /** Unix timestamp when event was created */
  created: z.number(),
  /** Whether this is a live (production) or test event */
  livemode: z.boolean(),
  /** Event type */
  type: WebhookEventTypeSchema,
  /** Event data containing the verification session */
  data: z.object({
    object: SessionResultSchema,
  }),
});

export type WebhookEvent = z.infer<typeof WebhookEventSchema>;

// ============================================================================
// Type-safe Event Handlers
// ============================================================================

/**
 * Handler function type for a specific webhook event
 */
export type WebhookEventHandler = (event: WebhookEvent) => void | Promise<void>;

/**
 * Map of event types to their handlers
 * All handlers are optional - only implement what you need
 */
export type WebhookEventHandlers = {
  [K in WebhookEventType]?: WebhookEventHandler;
};

// ============================================================================
// Webhook Signature Types
// ============================================================================

/**
 * Parsed signature header components
 */
export interface ParsedSignatureHeader {
  /** Unix timestamp from the signature */
  timestamp: number;
  /** Array of v1 signatures (multiple for key rotation) */
  signatures: string[];
}

/**
 * Options for webhook signature verification
 */
export interface WebhookVerifyOptions {
  /** Tolerance in seconds for timestamp validation (default: 300 = 5 minutes) */
  tolerance?: number;
}

/**
 * Options for constructing webhook events
 */
export interface WebhookConstructOptions extends WebhookVerifyOptions {
  /** Custom JSON parser (defaults to JSON.parse) */
  parser?: (body: string) => unknown;
}
