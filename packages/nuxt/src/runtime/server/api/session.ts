/**
 * Session API Route for Nuxt
 *
 * Creates verification sessions by proxying to the Authbound gateway.
 */

import { defineEventHandler, readBody, createError } from "h3";
import { useRuntimeConfig } from "#imports";

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig();
  const body = await readBody(event);

  // Get secrets from environment
  const gatewayUrl =
    process.env.AUTHBOUND_GATEWAY_URL ?? "https://gateway.authbound.io";
  const secret = process.env.AUTHBOUND_SECRET;

  if (!secret) {
    throw createError({
      statusCode: 500,
      message: "AUTHBOUND_SECRET not configured",
    });
  }

  // Use policy from request or config default
  const policyId = body?.policyId ?? config.public.authbound?.policyId;

  if (!policyId) {
    throw createError({
      statusCode: 400,
      message: "Policy ID is required",
    });
  }

  try {
    // Proxy to gateway
    const response = await fetch(`${gatewayUrl}/v1/sessions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${secret}`,
      },
      body: JSON.stringify({
        policyId,
        customerUserRef: body?.customerUserRef,
        metadata: body?.metadata,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      if (config.public.authbound?.debug) {
        console.error("[Authbound] Gateway error:", errorText);
      }
      throw createError({
        statusCode: response.status,
        message: "Failed to create session",
      });
    }

    return await response.json();
  } catch (error) {
    if (config.public.authbound?.debug) {
      console.error("[Authbound] Session creation error:", error);
    }
    throw createError({
      statusCode: 500,
      message: "Failed to create verification session",
    });
  }
});
