import {
  AuthboundClientError,
  createToken,
  type HandlerKernelCookieEffects,
  type HandlerKernelErrorBody,
  type HandlerKernelResponse,
  mapHandlerKernelException,
  resolveApiUrl,
} from "@authbound/server";
import { createError, deleteCookie, type H3Event, setCookie } from "h3";

/**
 * The Authbound API host the secret key belongs to: the module's `apiUrl`
 * (`NUXT_PUBLIC_AUTHBOUND_API_URL`), else `AUTHBOUND_API_URL`. A missing or
 * invalid value is a 500 with `MISSING_API_URL` or `INVALID_API_URL`.
 */
export function authboundApiUrl(configured: string | undefined): string {
  try {
    return resolveApiUrl(configured || undefined);
  } catch (error) {
    throw apiHostError(error);
  }
}

/**
 * The h3 error for an API host failure, with the SDK's error code in `data`:
 * 500 for a missing or invalid URL, 502 for an unreachable host.
 */
export function apiHostError(error: unknown): unknown {
  if (!(error instanceof AuthboundClientError)) {
    return error;
  }
  switch (error.code) {
    case "MISSING_API_URL":
    case "INVALID_API_URL":
      return createError({
        statusCode: 500,
        message: error.message,
        data: { code: error.code },
      });
    case "NETWORK_ERROR":
      return createError({
        statusCode: 502,
        message: error.message,
        data: { code: error.code },
      });
    default:
      return error;
  }
}

export function getPendingCookieName(cookieName: string): string {
  return `${cookieName}_pending`;
}

export async function applyNuxtCookieEffects(
  event: H3Event,
  effects: HandlerKernelCookieEffects | undefined,
  options: {
    sessionSecret: string;
    cookieName: string;
    secure: boolean;
    sessionMaxAge?: number;
  }
): Promise<void> {
  if (!effects) {
    return;
  }

  const cookieMaxAge = options.sessionMaxAge ?? 60 * 60 * 24 * 7;

  if (effects.setVerification) {
    const token = await createToken({
      secret: options.sessionSecret,
      userRef: effects.setVerification.userRef,
      verificationId: effects.setVerification.verificationId,
      status: effects.setVerification.status,
      assuranceLevel: effects.setVerification.assuranceLevel,
      ageClaims: effects.setVerification.ageClaims,
      expiresIn: cookieMaxAge,
    });

    setCookie(event, options.cookieName, token, {
      httpOnly: true,
      maxAge: cookieMaxAge,
      path: "/",
      sameSite: "lax",
      secure: options.secure,
    });
  }

  if (effects.clearVerification) {
    deleteCookie(event, options.cookieName, {
      httpOnly: true,
      path: "/",
      sameSite: "lax",
      secure: options.secure,
    });
  }

  if (effects.setPendingVerification) {
    const maxAge = 600;
    const token = await createToken({
      secret: options.sessionSecret,
      userRef: effects.setPendingVerification.userRef,
      verificationId: effects.setPendingVerification.verificationId,
      status: "PENDING",
      assuranceLevel: "NONE",
      expiresIn: maxAge,
    });

    setCookie(event, getPendingCookieName(options.cookieName), token, {
      httpOnly: true,
      maxAge,
      path: "/",
      sameSite: "lax",
      secure: options.secure,
    });
  }

  if (effects.clearPendingVerification) {
    deleteCookie(event, getPendingCookieName(options.cookieName), {
      httpOnly: true,
      path: "/",
      sameSite: "lax",
      secure: options.secure,
    });
  }
}

export async function returnNuxtKernelResult<TBody>(
  event: H3Event,
  result: HandlerKernelResponse<TBody | HandlerKernelErrorBody>,
  cookieOptions?: {
    sessionSecret: string;
    cookieName: string;
    secure: boolean;
    sessionMaxAge?: number;
  }
): Promise<TBody> {
  if (result.status >= 400) {
    const body = result.body as HandlerKernelErrorBody;
    throw createError({
      statusCode: result.status,
      message: body.error,
      data: {
        code: body.code,
        ...(body.details ? { details: body.details } : {}),
      },
    });
  }

  if (cookieOptions) {
    try {
      await applyNuxtCookieEffects(event, result.cookies, cookieOptions);
    } catch (error) {
      const mapped = mapHandlerKernelException(error, "Cookie handling", {});
      const body = mapped.body;
      throw createError({
        statusCode: mapped.status,
        message: body.error,
        data: {
          code: body.code,
          ...(body.details ? { details: body.details } : {}),
        },
      });
    }
  }

  return result.body as TBody;
}
