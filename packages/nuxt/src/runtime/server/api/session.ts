import {
  AuthboundClient,
  finalizeSessionHandlerKernel,
  getVerificationFromToken,
} from "@authbound/server";
import {
  createError,
  defineEventHandler,
  getCookie,
  getHeader,
  getRequestURL,
  readBody,
} from "h3";
import { useRuntimeConfig } from "nitropack/runtime";
import { getPendingCookieName, returnNuxtKernelResult } from "./server-kernel";

function sessionOriginRequest(event: Parameters<typeof getRequestURL>[0]) {
  return {
    url: getRequestURL(event, {
      xForwardedHost: false,
      xForwardedProto: false,
    }).toString(),
    headers: {
      get: (name: string) => getHeader(event, name) ?? null,
    },
  };
}

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig();
  const body = await readBody(event);

  const sessionSecret =
    config.authbound?.sessionSecret ?? process.env.AUTHBOUND_SESSION_SECRET;

  if (!sessionSecret) {
    throw createError({
      statusCode: 500,
      message: "AUTHBOUND_SESSION_SECRET not configured",
      data: { code: "CONFIG_MISSING" },
    });
  }

  const cookieName = config.authbound?.cookieName ?? "__authbound";
  const pendingCookie = getCookie(event, getPendingCookieName(cookieName));
  const pendingVerification = pendingCookie
    ? await getVerificationFromToken(pendingCookie, sessionSecret)
    : null;

  const gatewayUrl =
    process.env.AUTHBOUND_API_URL ?? "https://api.authbound.io";
  const apiKey = config.authbound?.apiKey ?? process.env.AUTHBOUND_SECRET_KEY;

  if (!apiKey) {
    throw createError({
      statusCode: 500,
      message: "AUTHBOUND_SECRET_KEY not configured",
      data: { code: "CONFIG_MISSING" },
    });
  }

  const client = new AuthboundClient({ apiKey, apiUrl: gatewayUrl });
  const result = await finalizeSessionHandlerKernel({
    request: sessionOriginRequest(event),
    requestBody: body,
    pendingVerification,
    config: {
      allowedOrigins: config.authbound?.allowedOrigins,
      trustProxy: config.authbound?.trustProxy,
      debug: config.public.authbound?.debug,
    },
    client,
  });

  return returnNuxtKernelResult(event, result, {
    sessionSecret,
    cookieName,
    secure: process.env.NODE_ENV === "production",
  });
});
