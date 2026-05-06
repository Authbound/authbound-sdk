import {
  calculateAge,
  createToken,
  getVerificationFromToken,
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
import { useRuntimeConfig } from "nuxt/app";

type FinalizeSessionRequest = {
  verificationId?: string;
  clientToken?: string;
};

const KNOWN_VERIFICATION_STATUSES = new Set([
  "created",
  "awaiting_user",
  "awaiting_provider",
  "pending",
  "processing",
  "verified",
  "failed",
  "canceled",
  "expired",
]);

function getPendingCookieName(cookieName: string): string {
  return `${cookieName}_pending`;
}

function assertSameOriginSessionRequest(
  event: Parameters<typeof getRequestURL>[0]
) {
  const origin = getHeader(event, "origin");
  if (origin && origin !== getRequestURL(event).origin) {
    throw createError({
      statusCode: 403,
      message: "Cross-origin session finalization is not allowed",
      data: { code: "CROSS_ORIGIN_FORBIDDEN" },
    });
  }

  if (getHeader(event, "sec-fetch-site") === "cross-site") {
    throw createError({
      statusCode: 403,
      message: "Cross-origin session finalization is not allowed",
      data: { code: "CROSS_ORIGIN_FORBIDDEN" },
    });
  }
}

function normalizeBrowserOrigin(value: string | undefined): string | undefined {
  if (!value) {
    return;
  }

  try {
    const origin = new URL(value).origin;
    return origin === "null" ? undefined : origin;
  } catch {
    return;
  }
}

function originForStatusProxy(
  event: Parameters<typeof getRequestURL>[0]
): string | undefined {
  return (
    normalizeBrowserOrigin(getHeader(event, "origin")) ??
    normalizeBrowserOrigin(getRequestURL(event).origin)
  );
}

function getBirthDate(
  attributes: Record<string, unknown> | undefined
): string | undefined {
  if (typeof attributes?.birth_date === "string") {
    return attributes.birth_date;
  }
  if (typeof attributes?.dateOfBirth === "string") {
    return attributes.dateOfBirth;
  }
  return;
}

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig();
  assertSameOriginSessionRequest(event);

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

  const publishableKey =
    config.public.authbound?.publishableKey ??
    process.env.NUXT_PUBLIC_AUTHBOUND_PK ??
    process.env.VITE_AUTHBOUND_PK ??
    process.env.AUTHBOUND_PUBLISHABLE_KEY;

  if (!publishableKey) {
    throw createError({
      statusCode: 500,
      message: "Authbound publishable key is not configured",
      data: { code: "CONFIG_MISSING" },
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
  const statusHeaders: Record<string, string> = {
    Authorization: `Bearer ${clientToken}`,
    "X-Authbound-Publishable-Key": publishableKey,
  };
  const origin = originForStatusProxy(event);
  if (origin) {
    statusHeaders.Origin = origin;
  }

  const statusResponse = await fetch(
    `${gatewayUrl}/v1/verifications/${encodeURIComponent(verificationId)}/status`,
    { headers: statusHeaders }
  );

  if (!statusResponse.ok) {
    throw createError({
      statusCode: statusResponse.status,
      message: "Failed to get verification status",
      data: { code: "STATUS_REQUEST_FAILED" },
    });
  }

  const statusBody = (await statusResponse.json()) as {
    status?: string;
    result?: {
      verified?: boolean;
      attributes?: Record<string, unknown>;
    };
  };

  if (
    typeof statusBody.status !== "string" ||
    !KNOWN_VERIFICATION_STATUSES.has(statusBody.status)
  ) {
    throw createError({
      statusCode: 502,
      message: "Unknown verification status from Authbound",
      data: { code: "VERIFICATION_INVALID_STATE" },
    });
  }

  if (
    statusBody.status !== "verified" ||
    statusBody.result?.verified === false
  ) {
    throw createError({
      statusCode: 409,
      message: "Verification is not verified",
      data: { code: "VERIFICATION_NOT_VERIFIED" },
    });
  }

  const attributes = statusBody.result?.attributes;
  const birthDate = getBirthDate(attributes);
  const age =
    typeof attributes?.age === "number"
      ? attributes.age
      : birthDate
        ? calculateAge(birthDate)
        : undefined;
  const cookieMaxAge = 60 * 60 * 24 * 7;
  const token = await createToken({
    secret: sessionSecret,
    userRef: pendingVerification.userRef,
    verificationId,
    status: "VERIFIED",
    assuranceLevel: "SUBSTANTIAL",
    age,
    dateOfBirth: birthDate,
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
    status: statusBody.status,
  };
});
