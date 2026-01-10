/**
 * Hono middleware for Authbound route protection.
 *
 * @example
 * ```ts
 * import { Hono } from 'hono';
 * import { authboundMiddleware } from '@authbound/server/hono';
 *
 * const app = new Hono();
 *
 * // Protect all routes under /adult-content
 * app.use('/adult-content/*', authboundMiddleware(config));
 * ```
 */

import type { Context, MiddlewareHandler } from "hono";
import type {
  AuthboundConfig,
  AuthboundSession,
  MiddlewareResult,
  ProtectedRouteConfig,
  VerificationRequirements,
} from "../core/types";
import { checkRequirements, parseConfig } from "../core/types";
import { getSessionFromCookie } from "./cookies";

// ============================================================================
// Types
// ============================================================================

export interface HonoMiddlewareOptions {
  /**
   * Custom handler for when verification requirements are not met.
   * Return a Response to override the default redirect behavior.
   */
  onVerificationRequired?: (
    c: Context,
    result: MiddlewareResult
  ) => Response | Promise<Response> | void | Promise<void>;

  /**
   * Custom handler to run after session validation.
   * Useful for logging or additional checks.
   */
  onSessionValidated?: (
    c: Context,
    result: MiddlewareResult
  ) => void | Promise<void>;

  /**
   * Skip middleware for certain paths.
   * Returns true to skip, false to process.
   */
  skip?: (c: Context) => boolean | Promise<boolean>;
}

// Declare variable type for Hono context
declare module "hono" {
  interface ContextVariableMap {
    authboundSession: AuthboundSession | null;
  }
}

// ============================================================================
// Static File Detection
// ============================================================================

const STATIC_FILE_EXTENSIONS =
  /\.(ico|png|jpg|jpeg|gif|svg|webp|css|js|woff|woff2|ttf|eot|json|xml|txt|pdf|zip|mp4|webm|mp3|wav|ogg)$/i;

const STATIC_PATHS = [
  "/favicon.ico",
  "/robots.txt",
  "/sitemap.xml",
  "/manifest.json",
];

function isStaticFile(pathname: string): boolean {
  if (STATIC_PATHS.some((path) => pathname === path)) {
    return true;
  }
  if (STATIC_FILE_EXTENSIONS.test(pathname)) {
    return true;
  }
  return false;
}

// ============================================================================
// Route Matching
// ============================================================================

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

function findMatchingRoute(
  pathname: string,
  routes: ProtectedRouteConfig[]
): ProtectedRouteConfig | undefined {
  return routes.find((route) => matchRoute(pathname, route.path));
}

// ============================================================================
// URL Helpers
// ============================================================================

function buildVerifyUrl(c: Context, verifyPath: string): string {
  const returnPath = new URL(c.req.url).pathname;
  const url = new URL(verifyPath, c.req.url);

  if (returnPath !== verifyPath) {
    url.searchParams.set("returnTo", returnPath);
  }

  return url.pathname + url.search;
}

// ============================================================================
// Middleware Factory
// ============================================================================

/**
 * Create an Authbound middleware for Hono.
 *
 * This middleware protects routes based on the configuration.
 * It checks session cookies and enforces verification requirements.
 *
 * @example
 * ```ts
 * import { Hono } from 'hono';
 * import { authboundMiddleware } from '@authbound/server/hono';
 *
 * const app = new Hono();
 *
 * app.use('/protected/*', authboundMiddleware({
 *   apiKey: process.env.AUTHBOUND_API_KEY!,
 *   secret: process.env.AUTHBOUND_SECRET!,
 *   routes: {
 *     protected: [
 *       { path: '/dashboard', requirements: { verified: true } },
 *       { path: '/adult-content', requirements: { minAge: 18 } },
 *     ],
 *     verify: '/verify',
 *   },
 * }));
 * ```
 */
export function authboundMiddleware(
  config: AuthboundConfig,
  options: HonoMiddlewareOptions = {}
): MiddlewareHandler {
  const validatedConfig = parseConfig(config);

  return async (c, next) => {
    const pathname = new URL(c.req.url).pathname;

    try {
      // Check if we should skip this request
      if (options.skip) {
        const shouldSkip = await options.skip(c);
        if (shouldSkip) {
          return next();
        }
      }

      // Skip static files
      if (isStaticFile(pathname)) {
        return next();
      }

      // Don't protect the verify page itself
      if (pathname === validatedConfig.routes.verify) {
        return next();
      }

      // Find matching protected route
      const matchingRoute = findMatchingRoute(
        pathname,
        validatedConfig.routes.protected
      );

      // If no matching route, allow through
      if (!matchingRoute) {
        return next();
      }

      // Get session from cookie
      const session = await getSessionFromCookie(c, validatedConfig);

      // Store session in context for downstream handlers
      c.set("authboundSession", session);

      // Check requirements
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
          : buildVerifyUrl(c, validatedConfig.routes.verify),
      };

      // Call session validated hook
      if (options.onSessionValidated) {
        await options.onSessionValidated(c, result);
      }

      // If requirements are met, allow through
      if (result.allowed) {
        // Add session data to response headers
        if (session) {
          c.header("x-authbound-verified", session.isVerified.toString());
          c.header("x-authbound-status", session.status);
          c.header("x-authbound-session-id", session.sessionId);
        }

        return next();
      }

      // Requirements not met - handle redirect
      if (options.onVerificationRequired) {
        const customResponse = await options.onVerificationRequired(c, result);
        if (customResponse) {
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
      return c.redirect(result.redirectUrl!, 302);
    } catch (error) {
      if (validatedConfig.debug) {
        console.error("[Authbound] Middleware error:", error);
      }
      throw error;
    }
  };
}

// ============================================================================
// Simple Requirements Middleware
// ============================================================================

/**
 * Create middleware for specific verification requirements.
 * Use this for simple route protection without full route configuration.
 *
 * @example
 * ```ts
 * import { Hono } from 'hono';
 * import { withAuthbound } from '@authbound/server/hono';
 *
 * const app = new Hono();
 *
 * // Protect a specific route
 * app.use('/adult-content/*', withAuthbound(config, { minAge: 18 }));
 * ```
 */
export function withAuthbound(
  config: AuthboundConfig,
  requirements: VerificationRequirements,
  options: HonoMiddlewareOptions = {}
): MiddlewareHandler {
  const validatedConfig = parseConfig(config);

  return async (c, next) => {
    try {
      // Check if we should skip
      if (options.skip) {
        const shouldSkip = await options.skip(c);
        if (shouldSkip) {
          return next();
        }
      }

      // Get session from cookie
      const session = await getSessionFromCookie(c, validatedConfig);
      c.set("authboundSession", session);

      // Check requirements
      const requirementsCheck = checkRequirements(session, requirements);

      const result: MiddlewareResult = {
        allowed: requirementsCheck.met,
        session: session ?? undefined,
        reason: requirementsCheck.reason,
        redirectUrl: requirementsCheck.met
          ? undefined
          : buildVerifyUrl(c, validatedConfig.routes.verify),
      };

      // Call session validated hook
      if (options.onSessionValidated) {
        await options.onSessionValidated(c, result);
      }

      // If requirements are met, allow through
      if (result.allowed) {
        if (session) {
          c.header("x-authbound-verified", session.isVerified.toString());
          c.header("x-authbound-status", session.status);
          c.header("x-authbound-session-id", session.sessionId);
        }
        return next();
      }

      // Handle verification required
      if (options.onVerificationRequired) {
        const customResponse = await options.onVerificationRequired(c, result);
        if (customResponse) {
          return customResponse;
        }
      }

      // Debug logging
      if (validatedConfig.debug) {
        console.log("[Authbound] Redirecting to verification:", {
          path: new URL(c.req.url).pathname,
          reason: result.reason,
        });
      }

      // Default redirect
      return c.redirect(result.redirectUrl!, 302);
    } catch (error) {
      if (validatedConfig.debug) {
        console.error("[Authbound] Middleware error:", error);
      }
      throw error;
    }
  };
}
