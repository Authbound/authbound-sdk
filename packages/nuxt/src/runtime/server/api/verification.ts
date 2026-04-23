/**
 * Verification API Route for Nuxt
 *
 * Creates verifications by proxying to the Authbound gateway.
 */

import type { PolicyId } from "@authbound-sdk/core";
import { createError, defineEventHandler, getHeader, readBody } from "h3";
import { useRuntimeConfig } from "nuxt/app";

type CreateVerificationRequest = {
  policyId?: PolicyId;
  customerUserRef?: string;
  metadata?: Record<string, string>;
  provider?: "auto" | "vcs" | "eudi";
};

type GatewayVerificationResponse = {
  id?: string;
  verificationId?: string;
  client_token?: string;
  clientToken?: string;
  verification_url?: string;
  authorizationRequestUrl?: string;
  client_action?: {
    data?: string;
  };
  expires_at?: string;
  expiresAt?: string;
  deepLink?: string;
};

function mapGatewayVerificationResponse(raw: GatewayVerificationResponse) {
  return {
    verificationId: raw.verificationId ?? raw.id,
    authorizationRequestUrl:
      raw.authorizationRequestUrl ??
      raw.client_action?.data ??
      raw.verification_url,
    clientToken: raw.clientToken ?? raw.client_token,
    expiresAt: raw.expiresAt ?? raw.expires_at,
    deepLink: raw.deepLink ?? raw.client_action?.data,
  };
}

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig();
  const body = await readBody<CreateVerificationRequest>(event);

  const gatewayUrl =
    process.env.AUTHBOUND_GATEWAY_URL ?? "https://gateway.authbound.io";
  const secret = config.authbound?.secret ?? process.env.AUTHBOUND_SECRET;

  if (!secret) {
    throw createError({
      statusCode: 500,
      message: "AUTHBOUND_SECRET not configured",
    });
  }

  const policyId = config.authbound?.policyId ?? config.public.authbound?.policyId;

  if (!policyId) {
    throw createError({
      statusCode: 500,
      message: "Authbound policy ID is not configured",
    });
  }

  if (body?.policyId && body.policyId !== policyId) {
    throw createError({
      statusCode: 400,
      message: "Requested policy is not allowed",
    });
  }

  const provider = config.authbound?.provider;
  if (body?.provider && provider && body.provider !== provider) {
    throw createError({
      statusCode: 400,
      message: "Requested provider is not allowed",
    });
  }

  try {
    const idempotencyKey = getHeader(event, "idempotency-key");
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "X-Authbound-Key": secret,
    };
    if (idempotencyKey) {
      headers["Idempotency-Key"] = idempotencyKey;
    }

    const response = await fetch(`${gatewayUrl}/v1/verifications`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        policy_id: policyId,
        customer_user_ref: body?.customerUserRef,
        metadata: body?.metadata,
        provider: provider ?? body?.provider,
      }),
    });

    if (!response.ok) {
      const errorBody = await response.json().catch(() => ({}));
      if (config.public.authbound?.debug) {
        console.error("[Authbound] Gateway verification error:", {
          status: response.status,
          code:
            typeof errorBody === "object" && errorBody && "code" in errorBody
              ? errorBody.code
              : undefined,
        });
      }
      throw createError({
        statusCode: response.status,
        message:
          typeof errorBody === "object" &&
          errorBody &&
          "message" in errorBody &&
          typeof errorBody.message === "string"
            ? errorBody.message
            : "Failed to create verification",
        data: errorBody,
      });
    }

    const rawResponse =
      (await response.json()) as GatewayVerificationResponse;
    return mapGatewayVerificationResponse(rawResponse);
  } catch (error) {
    if (
      typeof error === "object" &&
      error &&
      "statusCode" in error
    ) {
      throw error;
    }
    if (config.public.authbound?.debug) {
      console.error("[Authbound] Verification creation error:", error);
    }
    throw createError({
      statusCode: 500,
      message: "Failed to create verification",
    });
  }
});
