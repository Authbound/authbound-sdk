/**
 * Hono cookie utilities for Authbound session management.
 *
 * Uses Hono's built-in cookie helper functions.
 *
 * @example
 * ```ts
 * import { Hono } from 'hono';
 * import { getSessionFromCookie } from '@authbound-sdk/server/hono';
 *
 * const app = new Hono();
 *
 * app.get('/status', async (c) => {
 *   const session = await getSessionFromCookie(c, config);
 *   return c.json({ session });
 * });
 * ```
 */

import type { Context } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import type { CookieOptions as HonoCookieOptions } from "hono/utils/cookie";
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
 * Build Hono-compatible cookie options from Authbound config.
 */
export function buildCookieOptions(config: AuthboundConfig): HonoCookieOptions {
  const defaults = getDefaultCookieOptions();
  const userOptions = config.cookie ?? {};

  return {
    maxAge: userOptions.maxAge ?? defaults.maxAge, // Hono uses seconds like our config
    path: userOptions.path ?? defaults.path,
    domain: userOptions.domain || undefined,
    secure: userOptions.secure ?? defaults.secure,
    sameSite: (userOptions.sameSite ?? defaults.sameSite) as
      | "Strict"
      | "Lax"
      | "None",
    httpOnly: userOptions.httpOnly ?? defaults.httpOnly,
  };
}

// ============================================================================
// Cookie Reading
// ============================================================================

/**
 * Get the raw cookie value from a Hono context.
 */
export function getCookieValue(
  c: Context,
  config: AuthboundConfig
): string | undefined {
  const cookieName = getCookieName(config);
  return getCookie(c, cookieName);
}

/**
 * Get the session from request cookies.
 * Returns null if no valid session cookie exists.
 */
export async function getSessionFromCookie(
  c: Context,
  config: AuthboundConfig
): Promise<AuthboundSession | null> {
  const token = getCookieValue(c, config);
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
 * Create and set a session cookie on a Hono context.
 */
export async function setSessionCookie(
  c: Context,
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

  setCookie(c, cookieName, token, cookieOptions);
}

/**
 * Clear the session cookie from a Hono context.
 */
export function clearSessionCookie(c: Context, config: AuthboundConfig): void {
  const cookieName = getCookieName(config);
  const cookieOptions = buildCookieOptions(config);

  deleteCookie(c, cookieName, {
    path: cookieOptions.path,
    domain: cookieOptions.domain,
    secure: cookieOptions.secure,
    sameSite: cookieOptions.sameSite,
  });
}
