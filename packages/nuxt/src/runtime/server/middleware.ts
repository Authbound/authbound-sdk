/**
 * Authbound Server Middleware for Nuxt
 *
 * Protects routes that require verification.
 */

import { verifyToken } from "@authbound/server";
import { defineEventHandler, getCookie, getRequestURL, sendRedirect } from "h3";
import { useRuntimeConfig } from "#imports";

/**
 * Check if a path matches a route pattern.
 */
function matchRoute(path: string, pattern: string): boolean {
  // Wildcard support
  if (pattern.endsWith("/*")) {
    const prefix = pattern.slice(0, -2);
    return path === prefix || path.startsWith(prefix + "/");
  }

  if (pattern.endsWith("*")) {
    const prefix = pattern.slice(0, -1);
    return path.startsWith(prefix);
  }

  // Exact match
  return path === pattern;
}

/**
 * Check if path matches any route in the list.
 */
function matchesAny(path: string, routes: string[]): boolean {
  return routes.some((route) => matchRoute(path, route));
}

/**
 * Default paths that should always be public.
 */
const DEFAULT_PUBLIC_PATHS = [
  "/_nuxt",
  "/api/authbound",
  "/favicon.ico",
  "/__nuxt_error",
];

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
function getSecureCookieName(baseName: string = DEFAULT_COOKIE_NAME): string {
  // Use __Host- prefix in production for maximum security
  // In development, we skip it because localhost doesn't support Secure cookies
  if (process.env.NODE_ENV === "production") {
    return `__Host-${baseName}`;
  }
  return baseName;
}

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig();
  const authboundConfig = config.authbound;

  // Skip if middleware is disabled
  if (!authboundConfig?.middleware) {
    return;
  }

  const url = getRequestURL(event);
  const path = url.pathname;

  // Skip static files
  if (/\.(ico|png|jpg|jpeg|gif|svg|css|js|woff|woff2|json)$/i.test(path)) {
    return;
  }

  // Skip default public paths
  if (matchesAny(path, DEFAULT_PUBLIC_PATHS)) {
    return;
  }

  // Get verify path from public config
  const verifyPath = config.public.authbound?.verifyPath ?? "/verify";

  // Skip verify page
  if (path === verifyPath) {
    return;
  }

  // Skip custom public routes
  if (
    authboundConfig.publicRoutes &&
    matchesAny(path, authboundConfig.publicRoutes)
  ) {
    return;
  }

  // If protected routes are specified, check if this path needs protection
  if (
    authboundConfig.protectedRoutes &&
    !matchesAny(path, authboundConfig.protectedRoutes)
  ) {
    return;
  }

  // Check for session cookie and verify JWT
  // Apply __Host- prefix in production unless disabled
  const baseCookieName = authboundConfig.cookieName ?? DEFAULT_COOKIE_NAME;
  const cookieName = authboundConfig.disableSecureCookiePrefix
    ? baseCookieName
    : getSecureCookieName(baseCookieName);
  const sessionCookie = getCookie(event, cookieName);
  const secret = authboundConfig.secret ?? process.env.AUTHBOUND_SECRET;

  if (sessionCookie) {
    if (!secret) {
      // No secret configured - warn and allow through (insecure mode)
      if (config.public.authbound?.debug) {
        console.warn(
          "[Authbound] Warning: No AUTHBOUND_SECRET configured. " +
            "Session cookies cannot be verified securely."
        );
      }
      return;
    }

    try {
      // Cryptographically verify the JWT token
      const claims = await verifyToken(sessionCookie, secret);

      if (claims) {
        // Check if token is not expired
        const now = Math.floor(Date.now() / 1000);
        if (claims.exp > now) {
          // Verify the session is in a verified state
          if (claims.status === "VERIFIED") {
            // Store claims in event context for downstream use
            event.context.authbound = claims;
            return;
          }
          if (config.public.authbound?.debug) {
            console.log(
              "[Authbound] Session not verified, status:",
              claims.status
            );
          }
        } else if (config.public.authbound?.debug) {
          console.log("[Authbound] Session token expired");
        }
      } else if (config.public.authbound?.debug) {
        console.log("[Authbound] Invalid session token (verification failed)");
      }
    } catch (error) {
      // Token is invalid, tampered with, or corrupted
      if (config.public.authbound?.debug) {
        console.error("[Authbound] Session token verification error:", error);
      }
    }
  }

  // User not verified - redirect to verify page
  const redirectUrl = new URL(verifyPath, url.origin);
  redirectUrl.searchParams.set("returnTo", path + url.search);

  if (config.public.authbound?.debug) {
    console.log("[Authbound] Redirecting to verification:", {
      path,
      redirectUrl: redirectUrl.toString(),
    });
  }

  return sendRedirect(event, redirectUrl.toString(), 302);
});
