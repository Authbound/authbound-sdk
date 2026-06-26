/**
 * Verification API Route for Nuxt
 *
 * Creates verifications by proxying to the Authbound API.
 */

import type {
  PolicyId,
  ProviderPreference,
  VerificationProviderOptions,
} from "@authbound/core";
import {
  AuthboundClient,
  type CreateVerificationResponse,
  createVerificationHandlerKernel,
  logError,
} from "@authbound/server";
import { createError, defineEventHandler, getHeader, readBody } from "h3";
import { useRuntimeConfig } from "nitropack/runtime";
import { returnNuxtKernelResult } from "./server-kernel";

type CreateVerificationRequest = {
  policyId?: PolicyId | string;
  customerUserRef?: string;
  metadata?: Record<string, unknown>;
  provider?: ProviderPreference;
  providerOptions?: VerificationProviderOptions;
};

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
  const providerOptions = config.authbound?.providerOptions;

  try {
    const sessionSecret =
      config.authbound?.sessionSecret ?? process.env.AUTHBOUND_SESSION_SECRET;
    const sessionMode = config.public.authbound?.sessionMode ?? "sdk";
    if (sessionMode === "sdk" && !sessionSecret) {
      throw createError({
        statusCode: 500,
        message: "AUTHBOUND_SESSION_SECRET not configured",
      });
    }

    const client = new AuthboundClient({
      apiKey,
      apiUrl: gatewayUrl,
      debug: config.public.authbound?.debug,
    });
    const result = await createVerificationHandlerKernel({
      requestBody: {
        policyId,
        customerUserRef: body?.customerUserRef,
        metadata: body?.metadata,
        provider: provider ?? body?.provider,
        providerOptions: providerOptions ?? body?.providerOptions,
      },
      config: { debug: config.public.authbound?.debug },
      client,
      idempotencyKey: getHeader(event, "idempotency-key") ?? undefined,
    });

    return returnNuxtKernelResult<CreateVerificationResponse>(
      event,
      result,
      sessionMode === "sdk" && sessionSecret
        ? {
            sessionSecret,
            cookieName: config.authbound?.cookieName ?? "__authbound",
            secure: process.env.NODE_ENV === "production",
          }
        : undefined
    );
  } catch (error) {
    if (typeof error === "object" && error && "statusCode" in error) {
      throw error;
    }
    if (config.public.authbound?.debug) {
      logError(error, "Verification creation error", true);
    }
    throw createError({
      statusCode: 500,
      message: "Failed to create verification",
    });
  }
});
