/**
 * @authbound/nextjs/middleware
 *
 * Simplified Next.js middleware for Authbound verification.
 *
 * @example
 * ```ts
 * // middleware.ts
 * import { withAuthbound } from '@authbound/nextjs/middleware';
 *
 * export default withAuthbound({
 *   publicRoutes: ['/', '/about', '/pricing'],
 * });
 *
 * export const config = {
 *   matcher: ['/((?!_next|static|.*\\.).*)'],
 * };
 * ```
 */

import { NextRequest, NextResponse } from "next/server";
import type { PolicyId } from "@authbound/core";
import { verifyToken, type AuthboundClaims } from "@authbound/server";

// ============================================================================
// Types
// ============================================================================

/**
 * Default cookie name without prefix.
 */
const DEFAULT_COOKIE_NAME = "authbound_session";

/**
 * Get the secure cookie name with __Host- prefix in production.
 *
 * The __Host- prefix provides additional security:
 * - Must have Secure flag
 * - Must have Path=/
 * - Cannot be set by subdomains
 *
 * This protects against subdomain takeover attacks.
 */
export function getSecureCookieName(baseName: string = DEFAULT_COOKIE_NAME): string {
  // Use __Host- prefix in production for maximum security
  // In development, we skip it because localhost doesn't support Secure cookies
  if (process.env.NODE_ENV === "production") {
    return `__Host-${baseName}`;
  }
  return baseName;
}

export interface WithAuthboundOptions {
  /**
   * Routes that don't require verification.
   * Supports exact paths ('/about') and wildcards ('/api/*').
   * @default []
   */
  publicRoutes?: (string | RegExp)[];

  /**
   * Routes that require verification.
   * If not specified, all non-public routes require verification.
   */
  protectedRoutes?: (string | RegExp)[];

  /**
   * Path to redirect for verification.
   * @default '/verify'
   */
  verifyPath?: string;

  /**
   * Default policy ID for protected routes.
   */
  policyId?: PolicyId;

  /**
   * Cookie name for session storage.
   * In production, automatically prefixed with __Host- for security.
   * @default 'authbound_session' (or '__Host-authbound_session' in production)
   */
  cookieName?: string;

  /**
   * Disable the __Host- prefix for cookies.
   * Only use this if you have a specific reason (e.g., subdomain sharing).
   * @default false
   */
  disableSecureCookiePrefix?: boolean;

  /**
   * Secret key for JWT verification.
   * Required for secure session validation.
   * @default process.env.AUTHBOUND_SECRET
   */
  secret?: string;

  /**
   * Enable debug logging.
   * @default false
   */
  debug?: boolean;

  /**
   * Custom handler for when verification is required.
   */
  onVerificationRequired?: (
    request: NextRequest
  ) => Response | NextResponse | Promise<Response | NextResponse | void> | void;

  /**
   * Custom function to check if user is verified.
   * Useful for integrating with custom session management.
   */
  isVerified?: (request: NextRequest) => boolean | Promise<boolean>;

  /**
   * Callback when a valid session is found.
   * Useful for passing claims to downstream handlers.
   */
  onVerified?: (request: NextRequest, claims: AuthboundClaims) => void | Promise<void>;
}

// ============================================================================
// Utilities
// ============================================================================

/**
 * Check if a pathname matches a route pattern.
 */
function matchRoute(pathname: string, pattern: string | RegExp): boolean {
  if (pattern instanceof RegExp) {
    return pattern.test(pathname);
  }

  // Wildcard support
  if (pattern.endsWith("/*")) {
    const prefix = pattern.slice(0, -2);
    return pathname === prefix || pathname.startsWith(prefix + "/");
  }

  if (pattern.endsWith("*")) {
    const prefix = pattern.slice(0, -1);
    return pathname.startsWith(prefix);
  }

  // Exact match
  return pathname === pattern;
}

/**
 * Check if pathname matches any route in the list.
 */
function matchesAnyRoute(
  pathname: string,
  routes: (string | RegExp)[]
): boolean {
  return routes.some((route) => matchRoute(pathname, route));
}

/**
 * Default paths that should always be public.
 */
const DEFAULT_PUBLIC_PATHS = [
  "/_next",
  "/api/authbound",
  "/favicon.ico",
  "/robots.txt",
  "/sitemap.xml",
];

/**
 * Static file extensions to skip.
 */
const STATIC_EXTENSIONS =
  /\.(ico|png|jpg|jpeg|gif|svg|webp|css|js|woff|woff2|ttf|eot|json|xml|txt|pdf)$/i;

// ============================================================================
// Middleware Factory
// ============================================================================

/**
 * Create a simplified Authbound middleware for Next.js.
 *
 * This is a higher-level API than `authboundMiddleware` from `@authbound/server`.
 * It provides sensible defaults and a simpler configuration.
 *
 * @example
 * ```ts
 * // middleware.ts - 3 lines!
 * import { withAuthbound } from '@authbound/nextjs';
 *
 * export default withAuthbound({
 *   publicRoutes: ['/', '/about', '/api/*'],
 * });
 *
 * export const config = { matcher: ['/((?!_next|static).*)'] };
 * ```
 *
 * @example
 * ```ts
 * // With custom verification check
 * import { withAuthbound } from '@authbound/nextjs';
 *
 * export default withAuthbound({
 *   publicRoutes: ['/', '/about'],
 *   isVerified: (request) => {
 *     // Custom session check
 *     const session = request.cookies.get('my_session');
 *     return !!session?.value;
 *   },
 * });
 * ```
 */
export function withAuthbound(
  options: WithAuthboundOptions = {}
): (request: NextRequest) => Promise<Response | NextResponse> {
  const {
    publicRoutes = [],
    protectedRoutes,
    verifyPath = "/verify",
    cookieName: customCookieName,
    disableSecureCookiePrefix = false,
    secret = process.env.AUTHBOUND_SECRET,
    debug = false,
    onVerificationRequired,
    onVerified,
    isVerified: customIsVerified,
  } = options;

  // Determine cookie name with optional __Host- prefix
  const cookieName = customCookieName
    ? (disableSecureCookiePrefix ? customCookieName : getSecureCookieName(customCookieName))
    : getSecureCookieName();

  // Validate secret is provided for secure operation
  if (!secret && !customIsVerified) {
    console.warn(
      "[Authbound] Warning: No AUTHBOUND_SECRET configured. " +
        "Set AUTHBOUND_SECRET environment variable or provide a custom isVerified function. " +
        "Without this, session cookies cannot be verified securely."
    );
  }

  // Combine default and custom public routes
  const allPublicRoutes = [
    ...DEFAULT_PUBLIC_PATHS,
    verifyPath,
    ...publicRoutes,
  ];

  return async (request: NextRequest): Promise<Response | NextResponse> => {
    const { pathname } = request.nextUrl;

    // Skip static files
    if (STATIC_EXTENSIONS.test(pathname)) {
      return NextResponse.next();
    }

    // Skip public routes
    if (matchesAnyRoute(pathname, allPublicRoutes)) {
      if (debug) {
        console.log("[Authbound] Public route, skipping:", pathname);
      }
      return NextResponse.next();
    }

    // If protected routes are specified, check if this route needs protection
    if (protectedRoutes && !matchesAnyRoute(pathname, protectedRoutes)) {
      if (debug) {
        console.log("[Authbound] Not a protected route, skipping:", pathname);
      }
      return NextResponse.next();
    }

    // Check if user is verified
    let verified = false;
    let claims: AuthboundClaims | null = null;

    if (customIsVerified) {
      verified = await customIsVerified(request);
    } else {
      // Default: verify JWT session cookie
      const sessionCookie = request.cookies.get(cookieName);

      if (sessionCookie?.value && secret) {
        try {
          // Cryptographically verify the JWT token
          claims = await verifyToken(sessionCookie.value, secret);

          if (claims) {
            // Check if token is not expired
            const now = Math.floor(Date.now() / 1000);
            if (claims.exp > now) {
              // Verify the session is in a verified state
              verified = claims.status === "VERIFIED";

              if (debug && !verified) {
                console.log("[Authbound] Session not verified, status:", claims.status);
              }
            } else if (debug) {
              console.log("[Authbound] Session token expired");
            }
          } else if (debug) {
            console.log("[Authbound] Invalid session token (verification failed)");
          }
        } catch (error) {
          // Token is invalid, tampered with, or corrupted
          if (debug) {
            console.error("[Authbound] Session token verification error:", error);
          }
          verified = false;
        }
      } else if (debug && sessionCookie?.value && !secret) {
        console.warn("[Authbound] Cannot verify cookie: no secret configured");
      }
    }

    if (verified) {
      if (debug) {
        console.log("[Authbound] User verified, allowing:", pathname);
      }

      // Call onVerified callback if provided
      if (claims && onVerified) {
        await onVerified(request, claims);
      }

      return NextResponse.next();
    }

    // User not verified - handle redirect
    if (debug) {
      console.log("[Authbound] User not verified, redirecting:", pathname);
    }

    // Custom handler
    if (onVerificationRequired) {
      const customResponse = await onVerificationRequired(request);
      if (customResponse) {
        return customResponse;
      }
    }

    // Default: redirect to verify page with return URL
    const url = new URL(verifyPath, request.url);
    url.searchParams.set("returnTo", pathname + request.nextUrl.search);

    return NextResponse.redirect(url);
  };
}

// ============================================================================
// Re-exports from @authbound/server/next
// ============================================================================

export {
  authboundMiddleware,
  chainMiddleware,
  createMatcherConfig,
  type AuthboundMiddleware,
  type MiddlewareOptions,
} from "@authbound/server/next";
