import { type NextRequest, NextResponse } from "next/server";
import type {
  AuthboundConfig,
  MiddlewareResult,
  ProtectedRouteConfig,
} from "../core/types";
import { checkRequirements, parseConfig } from "../core/types";
import { createRedirectResponse, getSessionFromCookie } from "./cookies";

// ============================================================================
// Types
// ============================================================================

export interface MiddlewareOptions {
  /**
   * Custom handler for when verification requirements are not met.
   * Return a Response to override default redirect behavior.
   * Return undefined (or don't return) to use default redirect behavior.
   */
  onVerificationRequired?: (
    request: NextRequest,
    result: MiddlewareResult
  ) => Response | NextResponse | Promise<Response | NextResponse | void> | void;

  /**
   * Custom handler to run after session validation but before route matching.
   * Useful for logging or additional checks.
   */
  onSessionValidated?: (
    request: NextRequest,
    result: MiddlewareResult
  ) => void | Promise<void>;

  /**
   * Skip middleware for certain paths.
   * Returns true to skip, false to process.
   */
  skip?: (request: NextRequest) => boolean | Promise<boolean>;
}

export type AuthboundMiddleware = (
  request: NextRequest
) => Promise<Response | NextResponse>;

// ============================================================================
// Static File Detection
// ============================================================================

/**
 * Common static file extensions that should be skipped by middleware.
 */
const STATIC_FILE_EXTENSIONS =
  /\.(ico|png|jpg|jpeg|gif|svg|webp|css|js|woff|woff2|ttf|eot|json|xml|txt|pdf|zip|mp4|webm|mp3|wav|ogg)$/i;

/**
 * Common Next.js static files and special paths.
 */
const NEXTJS_STATIC_PATHS = [
  "/favicon.ico",
  "/robots.txt",
  "/sitemap.xml",
  "/manifest.json",
  "/sw.js",
  "/workbox-",
];

/**
 * Check if a pathname is a static file that should be skipped.
 * More specific than checking for dots, avoids matching API routes.
 */
function isStaticFile(pathname: string): boolean {
  // Check for Next.js static paths
  if (NEXTJS_STATIC_PATHS.some((path) => pathname.startsWith(path))) {
    return true;
  }

  // Check for file extensions
  if (STATIC_FILE_EXTENSIONS.test(pathname)) {
    return true;
  }

  return false;
}

// ============================================================================
// Route Matching
// ============================================================================

/**
 * Check if a pathname matches a route pattern.
 */
function matchRoute(pathname: string, pattern: string | RegExp): boolean {
  if (pattern instanceof RegExp) {
    return pattern.test(pathname);
  }

  // String pattern - support wildcards
  if (pattern.endsWith("*")) {
    const prefix = pattern.slice(0, -1);
    return pathname.startsWith(prefix);
  }

  // Exact match or prefix match with trailing slash
  return pathname === pattern || pathname.startsWith(pattern + "/");
}

/**
 * Find matching protected route config for a pathname.
 */
function findMatchingRoute(
  pathname: string,
  routes: ProtectedRouteConfig[]
): ProtectedRouteConfig | undefined {
  // Return the first matching route (most specific should be listed first)
  return routes.find((route) => matchRoute(pathname, route.path));
}

// ============================================================================
// URL Helpers
// ============================================================================

/**
 * Build the redirect URL with return path.
 */
function buildVerifyUrl(
  request: NextRequest,
  verifyPath: string,
  returnTo?: string
): URL {
  const url = new URL(verifyPath, request.url);
  const returnPath =
    returnTo ?? request.nextUrl.pathname + request.nextUrl.search;

  // Only add returnTo if it's not the verify page itself
  if (returnPath !== verifyPath) {
    url.searchParams.set("returnTo", returnPath);
  }

  return url;
}

// ============================================================================
// Middleware Factory
// ============================================================================

/**
 * Create an Authbound middleware for Next.js.
 *
 * @example
 * ```ts
 * // middleware.ts
 * import { authboundMiddleware } from '@authbound/server/next';
 *
 * export default authboundMiddleware({
 *   apiKey: process.env.AUTHBOUND_API_KEY!,
 *   secret: process.env.AUTHBOUND_SECRET!,
 *   routes: {
 *     protected: [
 *       { path: '/dashboard', requirements: { verified: true } },
 *       { path: '/adult-content', requirements: { minAge: 18 } },
 *     ],
 *     verify: '/verify',
 *   },
 * });
 *
 * export const config = {
 *   matcher: ['/dashboard/:path*', '/adult-content/:path*'],
 * };
 * ```
 */
export function authboundMiddleware(
  config: AuthboundConfig,
  options: MiddlewareOptions = {}
): AuthboundMiddleware {
  // Validate config at initialization
  const validatedConfig = parseConfig(config);

  return async (request: NextRequest): Promise<Response | NextResponse> => {
    const { pathname } = request.nextUrl;

    // Check if we should skip this request
    if (options.skip) {
      const shouldSkip = await options.skip(request);
      if (shouldSkip) {
        return NextResponse.next();
      }
    }

    // Skip static files and internal Next.js routes
    if (
      pathname.startsWith("/_next") ||
      pathname.startsWith("/api/authbound") ||
      isStaticFile(pathname)
    ) {
      return NextResponse.next();
    }

    // Don't protect the verify page itself
    if (pathname === validatedConfig.routes.verify) {
      return NextResponse.next();
    }

    // Find matching protected route
    const matchingRoute = findMatchingRoute(
      pathname,
      validatedConfig.routes.protected
    );

    // If no matching route, allow through
    if (!matchingRoute) {
      return NextResponse.next();
    }

    // Get session from cookie
    const session = await getSessionFromCookie(request, validatedConfig);

    // Build middleware result
    const requirementsCheck = checkRequirements(
      session,
      matchingRoute.requirements
    );

    const result: MiddlewareResult = {
      allowed: requirementsCheck.met,
      session: session ?? undefined,
      reason: requirementsCheck.reason,
      redirectUrl: requirementsCheck.met
        ? undefined
        : buildVerifyUrl(request, validatedConfig.routes.verify).toString(),
    };

    // Call session validated hook
    if (options.onSessionValidated) {
      await options.onSessionValidated(request, result);
    }

    // If requirements are met, allow through
    if (result.allowed) {
      // Optionally add session data to headers for server components
      const response = NextResponse.next();

      if (session) {
        response.headers.set(
          "x-authbound-verified",
          session.isVerified.toString()
        );
        response.headers.set("x-authbound-status", session.status);
        response.headers.set("x-authbound-session-id", session.sessionId);
      }

      return response;
    }

    // Requirements not met - handle redirect
    if (options.onVerificationRequired) {
      const customResponse = await options.onVerificationRequired(
        request,
        result
      );
      if (customResponse !== undefined) {
        return customResponse;
      }
    }

    // Debug logging
    if (validatedConfig.debug) {
      console.log("[Authbound] Redirecting to verification:", {
        pathname,
        reason: result.reason,
        redirectUrl: result.redirectUrl,
      });
    }

    // Default: redirect to verify page
    return createRedirectResponse(
      buildVerifyUrl(request, validatedConfig.routes.verify),
      request
    );
  };
}

// ============================================================================
// Helper Middleware Combiners
// ============================================================================

/**
 * Chain multiple middlewares together.
 * Useful when combining Authbound with other middleware.
 */
export function chainMiddleware(
  ...middlewares: ((
    request: NextRequest
  ) =>
    | Promise<Response | NextResponse | void>
    | Response
    | NextResponse
    | void)[]
): (request: NextRequest) => Promise<Response | NextResponse> {
  return async (request: NextRequest): Promise<Response | NextResponse> => {
    for (const middleware of middlewares) {
      const result = await middleware(request);

      // If middleware returns a response (not NextResponse.next()), stop chain
      if (result && !isNextResponse(result)) {
        return result;
      }

      // If it's a redirect or error response, stop chain
      if (result instanceof NextResponse) {
        const status = result.status;
        if (status >= 300 && status < 400) {
          return result; // Redirect
        }
        if (status >= 400) {
          return result; // Error
        }
      }
    }

    return NextResponse.next();
  };
}

function isNextResponse(
  response: Response | NextResponse | void
): response is NextResponse {
  return response instanceof NextResponse;
}

// ============================================================================
// Utility: Create matcher config
// ============================================================================

/**
 * Helper to create Next.js middleware matcher config from protected routes.
 */
export function createMatcherConfig(routes: ProtectedRouteConfig[]): string[] {
  return routes
    .map((route) => {
      if (route.path instanceof RegExp) {
        // For RegExp, developer needs to provide their own matcher
        console.warn(
          "[Authbound] RegExp routes require manual matcher configuration"
        );
        return "";
      }

      // Convert string paths to Next.js matcher format
      if (route.path.endsWith("*")) {
        return route.path.slice(0, -1) + ":path*";
      }

      return route.path + "/:path*";
    })
    .filter(Boolean);
}
