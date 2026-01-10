import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
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
 * Cookie options for setting cookies
 */
export interface CookieSetOptions {
  name: string;
  maxAge?: number;
  path?: string;
  domain?: string;
  secure?: boolean;
  sameSite?: "strict" | "lax" | "none";
  httpOnly?: boolean;
}

/**
 * Build cookie options from config, merging with defaults.
 */
export function buildCookieOptions(config: AuthboundConfig): CookieSetOptions {
  const defaults = getDefaultCookieOptions();
  const userOptions = config.cookie ?? {};

  return {
    name: userOptions.name ?? defaults.name,
    maxAge: userOptions.maxAge ?? defaults.maxAge,
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
 * Get the raw cookie value from a request.
 */
export function getCookieValue(
  request: NextRequest,
  config: AuthboundConfig
): string | undefined {
  const cookieName = getCookieName(config);
  return request.cookies.get(cookieName)?.value;
}

/**
 * Get the session from the request cookies.
 * Returns null if no valid session cookie exists.
 */
export async function getSessionFromCookie(
  request: NextRequest,
  config: AuthboundConfig
): Promise<AuthboundSession | null> {
  const token = getCookieValue(request, config);
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
 * Create and set a session cookie on a response.
 */
export async function setSessionCookie(
  response: NextResponse,
  config: AuthboundConfig,
  sessionData: SetSessionCookieOptions
): Promise<NextResponse> {
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

  const cookieOptions = buildCookieOptions(config);
  const cookieName = getCookieName(config);

  response.cookies.set(cookieName, token, {
    maxAge: cookieOptions.maxAge,
    path: cookieOptions.path,
    domain: cookieOptions.domain,
    secure: cookieOptions.secure,
    sameSite: cookieOptions.sameSite,
    httpOnly: cookieOptions.httpOnly,
  });

  return response;
}

/**
 * Clear the session cookie from a response.
 */
export function clearSessionCookie(
  response: NextResponse,
  config: AuthboundConfig
): NextResponse {
  const cookieName = getCookieName(config);
  const cookieOptions = buildCookieOptions(config);

  response.cookies.set(cookieName, "", {
    maxAge: 0,
    path: cookieOptions.path,
    domain: cookieOptions.domain,
    secure: cookieOptions.secure,
    sameSite: cookieOptions.sameSite,
    httpOnly: cookieOptions.httpOnly,
  });

  return response;
}

// ============================================================================
// Response Helpers
// ============================================================================

/**
 * Create a redirect response with optional cookie operations.
 */
export function createRedirectResponse(
  url: string | URL,
  request: NextRequest,
  options?: {
    clearCookie?: boolean;
    config?: AuthboundConfig;
  }
): NextResponse {
  const response = NextResponse.redirect(url, { status: 302 });

  if (options?.clearCookie && options?.config) {
    clearSessionCookie(response, options.config);
  }

  return response;
}

/**
 * Create a JSON response.
 */
export function createJsonResponse<T>(
  data: T,
  status = 200,
  headers?: Record<string, string>
): NextResponse {
  return NextResponse.json(data, { status, headers });
}

/**
 * Create an error response.
 */
export function createErrorResponse(
  message: string,
  status = 400,
  code?: string
): NextResponse {
  return NextResponse.json(
    {
      error: message,
      code: code ?? "BAD_REQUEST",
    },
    { status }
  );
}
