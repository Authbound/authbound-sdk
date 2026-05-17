import {
  createToken,
  type HandlerKernelCookieEffects,
  type HandlerKernelErrorBody,
  type HandlerKernelResponse,
  mapHandlerKernelException,
} from "@authbound/server";
import { createError, deleteCookie, type H3Event, setCookie } from "h3";

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
      age: effects.setVerification.age,
      dateOfBirth: effects.setVerification.dateOfBirth,
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
      data: { code: body.code },
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
        data: { code: body.code },
      });
    }
  }

  return result.body as TBody;
}
