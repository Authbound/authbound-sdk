/**
 * Webhook API Route for Nuxt
 *
 * Handles webhook events from Authbound.
 */

import { processWebhookHandlerKernel } from "@authbound/server";
import { defineEventHandler, getHeader, readRawBody } from "h3";
import { useRuntimeConfig } from "nitropack/runtime";
import { returnNuxtKernelResult } from "./server-kernel";

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig();
  const rawBody = await readRawBody(event);

  const result = await processWebhookHandlerKernel({
    rawBody: rawBody ?? null,
    signature: getHeader(event, "x-authbound-signature") ?? null,
    config: {
      webhookSecret:
        config.authbound?.webhookSecret ?? process.env.AUTHBOUND_WEBHOOK_SECRET,
      webhookTolerance: config.authbound?.webhookTolerance,
      unsafeSkipWebhookSignatureVerification:
        config.authbound?.unsafeSkipWebhookSignatureVerification ?? false,
      debug: config.public.authbound?.debug ?? false,
    },
  });

  return returnNuxtKernelResult(event, result);
});
