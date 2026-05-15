import { isSameOriginSessionRequest } from "@authbound/core";
import {
  AuthboundClient,
  AuthboundClientError,
  createToken,
  getVerificationFromToken,
  toVerifiedSessionFinalization,
} from "@authbound/server";
import {
  createError,
  defineEventHandler,
  deleteCookie,
  getCookie,
  getHeader,
  getRequestURL,
  readBody,
  setCookie,
} from "h3";
import { useRuntimeConfig } from "nitropack/runtime";

type FinalizeSessionRequest = {
  verificationId?: string;
  clientToken?: string;
};

function getPendingCookieName(cookieName: string): string {
  return `${cookieName}_pending`;
}

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
  const originRequest = sessionOriginRequest(event);
  if (
    !isSameOriginSessionRequest(originRequest, {
      allowedOrigins: config.authbound?.allowedOrigins,
      trustProxy: config.authbound?.trustProxy,
    })
  ) {
    throw createError({
      statusCode: 403,
      message: "Cross-origin session finalization is not allowed",
      data: { code: "CROSS_ORIGIN_FORBIDDEN" },
    });
  }

  const body = await readBody<FinalizeSessionRequest>(event);

  const verificationId =
    typeof body?.verificationId === "string" ? body.verificationId : "";
  const clientToken =
    typeof body?.clientToken === "string" ? body.clientToken : "";

  if (!(verificationId && clientToken)) {
    throw createError({
      statusCode: 400,
      message: "Invalid request",
      data: { code: "INVALID_REQUEST" },
    });
  }

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
  if (
    !pendingVerification ||
    pendingVerification.status !== "PENDING" ||
    pendingVerification.verificationId !== verificationId
  ) {
    throw createError({
      statusCode: 403,
      message: "Verification finalization is not bound to this browser session",
      data: { code: "VERIFICATION_BINDING_REQUIRED" },
    });
  }

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
  const result = await client.verifications
    .getResult(verificationId)
    .catch((error: unknown) => {
      if (error instanceof AuthboundClientError) {
        throw createError({
          statusCode: error.statusCode ?? 500,
          message: error.message,
          data: { code: error.code },
        });
      }
      throw error;
    });
  const verifiedSession = toVerifiedSessionFinalization(result);

  if (!verifiedSession) {
    throw createError({
      statusCode: 409,
      message: "Verification is not verified",
      data: { code: "VERIFICATION_NOT_VERIFIED" },
    });
  }

  const cookieMaxAge = 60 * 60 * 24 * 7;
  const token = await createToken({
    secret: sessionSecret,
    userRef: pendingVerification.userRef,
    verificationId,
    status: "VERIFIED",
    assuranceLevel: "SUBSTANTIAL",
    age: verifiedSession.age,
    dateOfBirth: verifiedSession.dateOfBirth,
    expiresIn: cookieMaxAge,
  });

  setCookie(event, cookieName, token, {
    httpOnly: true,
    maxAge: cookieMaxAge,
    path: "/",
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });
  deleteCookie(event, getPendingCookieName(cookieName), {
    httpOnly: true,
    path: "/",
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });

  return {
    isVerified: true,
    verificationId,
    status: verifiedSession.status,
  };
});
