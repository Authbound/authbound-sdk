/**
 * Express.js cookie utilities for Authbound session management.
 *
 * Requires `cookie-parser` middleware to be installed:
 * ```ts
 * import cookieParser from 'cookie-parser';
 * app.use(cookieParser());
 * ```
 */

import type {
  CookieOptions as ExpressCookieOptions,
  Request,
  Response,
} from "express";
import { createToken, getVerificationFromToken } from "../core/jwt";
import type {
  AuthboundConfig,
  AuthboundVerificationContext,
} from "../core/types";
import { getDefaultCookieOptions } from "../core/types";

// ============================================================================
// Cookie Name Helper
// ============================================================================

/**
 * Get the cookie name from config or use default.
 */
export function getCookieName(config: AuthboundConfig): string {
  return config.cookie?.name ?? getDefaultCookieOptions().name;
}

export function getPendingCookieName(config: AuthboundConfig): string {
  return `${getCookieName(config)}_pending`;
}

// ============================================================================
// Cookie Options Builder
// ============================================================================

/**
 * Build Express-compatible cookie options from Authbound config.
 */
export function buildCookieOptions(
  config: AuthboundConfig
): ExpressCookieOptions {
  const defaults = getDefaultCookieOptions();
  const userOptions = config.cookie ?? {};

  return {
    maxAge: (userOptions.maxAge ?? defaults.maxAge) * 1000, // Express uses milliseconds
    path: userOptions.path ?? defaults.path,
    domain: userOptions.domain || undefined,
    secure: userOptions.secure ?? defaults.secure,
    sameSite: userOptions.sameSite ?? defaults.sameSite,
    httpOnly: userOptions.httpOnly ?? defaults.httpOnly,
  };
}

// ============================================================================
// Cookie Reading
// ============================================================================

/**
 * Get the raw cookie value from an Express request.
 * Requires cookie-parser middleware.
 */
export function getCookieValue(
  req: Request,
  config: AuthboundConfig
): string | undefined {
  const cookieName = getCookieName(config);
  return req.cookies?.[cookieName] ?? getCookieHeaderValue(req, cookieName);
}

function getCookieHeaderValue(req: Request, name: string): string | undefined {
  const cookieHeader = req.get("cookie");
  if (!cookieHeader) {
    return;
  }

  for (const part of cookieHeader.split(";")) {
    const [rawName, ...rawValue] = part.trim().split("=");
    if (rawName === name) {
      return rawValue.join("=");
    }
  }
  return;
}

/**
 * Get the session from request cookies.
 * Returns null if no valid session cookie exists.
 */
export async function getVerificationFromCookie(
  req: Request,
  config: AuthboundConfig
): Promise<AuthboundVerificationContext | null> {
  const token = getCookieValue(req, config);
  if (!token) return null;

  return getVerificationFromToken(token, config.secret);
}

export async function getPendingVerificationFromCookie(
  req: Request,
  config: AuthboundConfig
): Promise<AuthboundVerificationContext | null> {
  const token =
    req.cookies?.[getPendingCookieName(config)] ??
    getCookieHeaderValue(req, getPendingCookieName(config));
  if (!token) return null;

  return getVerificationFromToken(token, config.secret);
}

// ============================================================================
// Cookie Writing
// ============================================================================

export interface SetVerificationCookieOptions {
  userRef: string;
  verificationId: string;
  status: "VERIFIED" | "REJECTED" | "MANUAL_REVIEW_NEEDED" | "PENDING";
  assuranceLevel: "NONE" | "LOW" | "SUBSTANTIAL" | "HIGH";
  age?: number;
  dateOfBirth?: string;
}

/**
 * Create and set a session cookie on an Express response.
 */
export async function setVerificationCookie(
  res: Response,
  config: AuthboundConfig,
  sessionData: SetVerificationCookieOptions
): Promise<void> {
  const token = await createToken({
    secret: config.secret,
    userRef: sessionData.userRef,
    verificationId: sessionData.verificationId,
    status: sessionData.status,
    assuranceLevel: sessionData.assuranceLevel,
    age: sessionData.age,
    dateOfBirth: sessionData.dateOfBirth,
    expiresIn: config.cookie?.maxAge ?? getDefaultCookieOptions().maxAge,
  });

  const cookieName = getCookieName(config);
  const cookieOptions = buildCookieOptions(config);

  res.cookie(cookieName, token, cookieOptions);
}

export async function setPendingVerificationCookie(
  res: Response,
  config: AuthboundConfig,
  sessionData: Pick<SetVerificationCookieOptions, "userRef" | "verificationId">
): Promise<void> {
  const maxAge = Math.min(config.cookie?.maxAge ?? 600, 600);
  const token = await createToken({
    secret: config.secret,
    userRef: sessionData.userRef,
    verificationId: sessionData.verificationId,
    status: "PENDING",
    assuranceLevel: "NONE",
    expiresIn: maxAge,
  });

  res.cookie(getPendingCookieName(config), token, {
    ...buildCookieOptions(config),
    maxAge: maxAge * 1000,
    httpOnly: true,
  });
}

/**
 * Clear the session cookie from an Express response.
 */
export function clearVerificationCookie(
  res: Response,
  config: AuthboundConfig
): void {
  const cookieName = getCookieName(config);
  const cookieOptions = buildCookieOptions(config);

  res.clearCookie(cookieName, {
    path: cookieOptions.path,
    domain: cookieOptions.domain,
    secure: cookieOptions.secure,
    sameSite: cookieOptions.sameSite,
    httpOnly: cookieOptions.httpOnly,
  });
}

export function clearPendingVerificationCookie(
  res: Response,
  config: AuthboundConfig
): void {
  const cookieOptions = buildCookieOptions(config);

  res.clearCookie(getPendingCookieName(config), {
    path: cookieOptions.path,
    domain: cookieOptions.domain,
    secure: cookieOptions.secure,
    sameSite: cookieOptions.sameSite,
    httpOnly: true,
  });
}
