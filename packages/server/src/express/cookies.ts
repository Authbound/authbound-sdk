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
import { createToken, getSessionFromToken } from "../core/jwt";
import type { AuthboundConfig, AuthboundSession } from "../core/types";
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
  // cookie-parser populates req.cookies
  return req.cookies?.[cookieName];
}

/**
 * Get the session from request cookies.
 * Returns null if no valid session cookie exists.
 */
export async function getSessionFromCookie(
  req: Request,
  config: AuthboundConfig
): Promise<AuthboundSession | null> {
  const token = getCookieValue(req, config);
  if (!token) return null;

  return getSessionFromToken(token, config.secret);
}

// ============================================================================
// Cookie Writing
// ============================================================================

export interface SetSessionCookieOptions {
  userRef: string;
  sessionId: string;
  status: "VERIFIED" | "REJECTED" | "MANUAL_REVIEW_NEEDED" | "PENDING";
  assuranceLevel: "NONE" | "LOW" | "SUBSTANTIAL" | "HIGH";
  age?: number;
  dateOfBirth?: string;
}

/**
 * Create and set a session cookie on an Express response.
 */
export async function setSessionCookie(
  res: Response,
  config: AuthboundConfig,
  sessionData: SetSessionCookieOptions
): Promise<void> {
  const token = await createToken({
    secret: config.secret,
    userRef: sessionData.userRef,
    sessionId: sessionData.sessionId,
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

/**
 * Clear the session cookie from an Express response.
 */
export function clearSessionCookie(
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
