/**
 * Next.js adapter for QuickID webhooks
 *
 * Provides a convenient way to handle webhooks in Next.js API routes.
 *
 * @example
 * ```typescript
 * // app/api/webhooks/quickid/route.ts
 * import { QuickIDServer } from "@authbound/quickid-server";
 * import { createWebhookHandler } from "@authbound/quickid-server/nextjs";
 *
 * const quickid = new QuickIDServer({ apiKey: process.env.QUICKID_SECRET_KEY! });
 *
 * export const POST = createWebhookHandler({
 *   client: quickid,
 *   secret: process.env.QUICKID_WEBHOOK_SECRET!,
 *   handlers: {
 *     "identity.verification_session.verified": async (event) => {
 *       // Handle verified session
 *       const session = event.data.object;
 *       await db.users.update({
 *         where: { ref: session.client_reference_id },
 *         data: { verified: true },
 *       });
 *     },
 *     "identity.verification_session.requires_input": async (event) => {
 *       // Handle rejection - maybe send retry email
 *     },
 *   },
 * });
 * ```
 */

import type {
  WebhookEvent,
  WebhookEventHandlers,
  WebhookEventType,
} from "@authbound/quickid-core";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import {
  QuickIDSignatureVerificationError,
  QuickIDValidationError,
} from "../errors";
import type { QuickIDServer } from "../quickid";

/**
 * Configuration for the Next.js webhook handler
 */
export interface NextJSWebhookConfig {
  /** QuickIDServer instance */
  client: QuickIDServer;
  /** Webhook secret (from dashboard) */
  secret: string;
  /** Event handlers - only implement what you need */
  handlers: WebhookEventHandlers;
  /** Signature tolerance in seconds. Default: 300 (5 minutes) */
  tolerance?: number;
  /** Called when an unhandled event type is received */
  onUnhandledEvent?: (event: WebhookEvent) => void | Promise<void>;
  /** Called when an error occurs during handler execution */
  onError?: (error: Error, event?: WebhookEvent) => void | Promise<void>;
}

/**
 * Standard webhook response
 */
interface WebhookResponse {
  received: boolean;
  type?: WebhookEventType;
}

/**
 * Error response
 */
interface ErrorResponse {
  error: string;
}

/**
 * Create a Next.js App Router webhook handler
 *
 * Returns a POST handler function that can be exported directly
 * from a route file.
 *
 * @param config - Webhook handler configuration
 * @returns Next.js route handler function
 *
 * @example
 * ```typescript
 * // app/api/webhooks/quickid/route.ts
 * export const POST = createWebhookHandler({
 *   client: quickid,
 *   secret: process.env.QUICKID_WEBHOOK_SECRET!,
 *   handlers: {
 *     "identity.verification_session.verified": async (event) => {
 *       // ...
 *     },
 *   },
 * });
 * ```
 */
export function createWebhookHandler(
  config: NextJSWebhookConfig
): (
  request: NextRequest
) => Promise<NextResponse<WebhookResponse | ErrorResponse>> {
  return async function POST(
    request: NextRequest
  ): Promise<NextResponse<WebhookResponse | ErrorResponse>> {
    // Get raw body
    let rawBody: string;
    try {
      rawBody = await request.text();
    } catch {
      return NextResponse.json(
        { error: "Failed to read request body" },
        { status: 400 }
      );
    }

    // Get signature header
    const signatureHeader = request.headers.get("Authbound-Signature");
    if (!signatureHeader) {
      return NextResponse.json(
        { error: "Missing Authbound-Signature header" },
        { status: 400 }
      );
    }

    // Verify and construct event
    let event: WebhookEvent;
    try {
      event = config.client.webhookEvents.construct(
        rawBody,
        signatureHeader,
        config.secret,
        { tolerance: config.tolerance }
      );
    } catch (error) {
      if (error instanceof QuickIDSignatureVerificationError) {
        return NextResponse.json(
          { error: "Invalid webhook signature" },
          { status: 401 }
        );
      }
      if (error instanceof QuickIDValidationError) {
        return NextResponse.json(
          { error: "Invalid webhook payload" },
          { status: 400 }
        );
      }
      // Log unexpected errors but don't expose details
      console.error("[QuickID Webhook] Unexpected error:", error);
      return NextResponse.json(
        { error: "Internal server error" },
        { status: 500 }
      );
    }

    // Get handler for this event type
    const handler = config.handlers[event.type];

    try {
      if (handler) {
        // Execute handler
        await handler(event);
      } else if (config.onUnhandledEvent) {
        // Notify about unhandled event
        await config.onUnhandledEvent(event);
      }
    } catch (error) {
      // Handler threw an error
      if (config.onError) {
        try {
          await config.onError(
            error instanceof Error ? error : new Error(String(error)),
            event
          );
        } catch {
          // Ignore errors in error handler
        }
      }

      // Log the error
      console.error(
        `[QuickID Webhook] Handler error for ${event.type}:`,
        error
      );

      // Return 500 so webhook will be retried
      return NextResponse.json(
        { error: "Handler execution failed" },
        { status: 500 }
      );
    }

    // Success - acknowledge receipt
    return NextResponse.json({
      received: true,
      type: event.type,
    });
  };
}

/**
 * Disable body parsing for webhook routes
 *
 * Next.js App Router automatically handles raw bodies, but for Pages Router
 * you may need to export this config.
 *
 * @example
 * ```typescript
 * // pages/api/webhooks/quickid.ts (Pages Router)
 * export const config = webhookRouteConfig;
 * ```
 */
export const webhookRouteConfig = {
  api: {
    bodyParser: false,
  },
};
