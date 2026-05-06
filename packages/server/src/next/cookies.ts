import { NextResponse } from "next/server";
import { createToken, getVerificationFromToken } from "../core/jwt";
import type {
  AuthboundConfig,
  AuthboundVerificationContext,
} from "../core/types";
import { getDefaultCookieOptions } from "../core/types";

export interface CookieReadableRequest extends Request {
  cookies?: {
    get(name: string): { value?: string } | undefined;
  };
}

export interface CookieMutableResponse extends Response {
  cookies: {
    set(
      name: string,
      value: string,
      options?: Omit<CookieSetOptions, "name">
    ): void;
  };
}

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
  request: CookieReadableRequest,
  config: AuthboundConfig
): string | undefined {
  const cookieName = getCookieName(config);
  return (
    request.cookies?.get(cookieName)?.value ??
    getCookieHeaderValue(request, cookieName)
  );
}

function getCookieHeaderValue(
  request: Request,
  name: string
): string | undefined {
  const cookieHeader = request.headers.get("cookie");
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
 * Get the verification context from the request cookies.
 * Returns null if no valid verification cookie exists.
 */
export async function getVerificationFromCookie(
  request: CookieReadableRequest,
  config: AuthboundConfig
): Promise<AuthboundVerificationContext | null> {
  const token = getCookieValue(request, config);
  if (!token) return null;

  return getVerificationFromToken(token, config.secret);
}

export async function getPendingVerificationFromCookie(
  request: CookieReadableRequest,
  config: AuthboundConfig
): Promise<AuthboundVerificationContext | null> {
  const token =
    request.cookies?.get(getPendingCookieName(config))?.value ??
    getCookieHeaderValue(request, getPendingCookieName(config));
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
 * Create and set a verification cookie on a response.
 */
export async function setVerificationCookie(
  response: CookieMutableResponse,
  config: AuthboundConfig,
  verificationData: SetVerificationCookieOptions
): Promise<CookieMutableResponse> {
  const token = await createToken({
    secret: config.secret,
    userRef: verificationData.userRef,
    verificationId: verificationData.verificationId,
    status: verificationData.status,
    assuranceLevel: verificationData.assuranceLevel,
    age: verificationData.age,
    dateOfBirth: verificationData.dateOfBirth,
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

export async function setPendingVerificationCookie(
  response: CookieMutableResponse,
  config: AuthboundConfig,
  verificationData: Pick<
    SetVerificationCookieOptions,
    "userRef" | "verificationId"
  >
): Promise<CookieMutableResponse> {
  const maxAge = Math.min(config.cookie?.maxAge ?? 600, 600);
  const token = await createToken({
    secret: config.secret,
    userRef: verificationData.userRef,
    verificationId: verificationData.verificationId,
    status: "PENDING",
    assuranceLevel: "NONE",
    expiresIn: maxAge,
  });

  const cookieOptions = buildCookieOptions(config);

  response.cookies.set(getPendingCookieName(config), token, {
    maxAge,
    path: cookieOptions.path,
    domain: cookieOptions.domain,
    secure: cookieOptions.secure,
    sameSite: cookieOptions.sameSite,
    httpOnly: true,
  });

  return response;
}

/**
 * Clear the verification cookie from a response.
 */
export function clearVerificationCookie(
  response: CookieMutableResponse,
  config: AuthboundConfig
): CookieMutableResponse {
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

export function clearPendingVerificationCookie(
  response: CookieMutableResponse,
  config: AuthboundConfig
): CookieMutableResponse {
  const cookieOptions = buildCookieOptions(config);

  response.cookies.set(getPendingCookieName(config), "", {
    maxAge: 0,
    path: cookieOptions.path,
    domain: cookieOptions.domain,
    secure: cookieOptions.secure,
    sameSite: cookieOptions.sameSite,
    httpOnly: true,
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
  _request: Request,
  options?: {
    clearCookie?: boolean;
    config?: AuthboundConfig;
  }
): CookieMutableResponse {
  const response = NextResponse.redirect(url, {
    status: 302,
  }) as CookieMutableResponse;

  if (options?.clearCookie && options?.config) {
    clearVerificationCookie(response, options.config);
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
): CookieMutableResponse {
  return NextResponse.json(data, { status, headers }) as CookieMutableResponse;
}

/**
 * Create an error response.
 */
export function createErrorResponse(
  message: string,
  status = 400,
  code?: string
): Response {
  return NextResponse.json(
    {
      error: message,
      code: code ?? "BAD_REQUEST",
    },
    { status }
  );
}
