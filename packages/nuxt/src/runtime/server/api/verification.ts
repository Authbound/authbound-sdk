/**
 * Verification API Route for Nuxt
 *
 * Creates verifications by proxying to the Authbound API.
 */

import type { PolicyId } from "@authbound/core";
import { createToken } from "@authbound/server";
import {
  createError,
  defineEventHandler,
  getHeader,
  readBody,
  setCookie,
} from "h3";
import { useRuntimeConfig } from "nuxt/app";
import {
  type GatewayVerificationResponse,
  mapGatewayVerificationResponse,
} from "./verification-mapper";

type CreateVerificationRequest = {
  policyId?: PolicyId | string;
  customerUserRef?: string;
  metadata?: Record<string, string>;
  provider?: "auto" | "vcs" | "eudi";
};

function getPendingCookieName(cookieName: string): string {
  return `${cookieName}_pending`;
}

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig();
  const body = await readBody<CreateVerificationRequest>(event);

  const gatewayUrl =
    process.env.AUTHBOUND_API_URL ?? "https://api.authbound.io";
  const apiKey = config.authbound?.apiKey ?? process.env.AUTHBOUND_SECRET_KEY;

  if (!apiKey) {
    throw createError({
      statusCode: 500,
      message: "AUTHBOUND_SECRET_KEY not configured",
    });
  }

  const policyId =
    config.authbound?.policyId ?? config.public.authbound?.policyId;

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
      "X-Authbound-Key": apiKey,
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

    const rawResponse = (await response.json()) as GatewayVerificationResponse;
    const verificationResponse = mapGatewayVerificationResponse(rawResponse);

    if ((config.public.authbound?.sessionMode ?? "sdk") === "sdk") {
      const verificationId = verificationResponse.verificationId;
      if (!verificationId) {
        throw createError({
          statusCode: 502,
          message: "Authbound verification response is missing an id.",
        });
      }

      const sessionSecret =
        config.authbound?.sessionSecret ??
        process.env.AUTHBOUND_SESSION_SECRET ??
        process.env.AUTHBOUND_SECRET;
      if (!sessionSecret) {
        throw createError({
          statusCode: 500,
          message: "AUTHBOUND_SESSION_SECRET not configured",
        });
      }

      const maxAge = 600;
      const token = await createToken({
        secret: sessionSecret,
        userRef: body?.customerUserRef ?? verificationId,
        verificationId,
        status: "PENDING",
        assuranceLevel: "NONE",
        expiresIn: maxAge,
      });

      setCookie(
        event,
        getPendingCookieName(config.authbound?.cookieName ?? "__authbound"),
        token,
        {
          httpOnly: true,
          maxAge,
          path: "/",
          sameSite: "lax",
          secure: process.env.NODE_ENV === "production",
        }
      );
    }

    return verificationResponse;
  } catch (error) {
    if (typeof error === "object" && error && "statusCode" in error) {
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
