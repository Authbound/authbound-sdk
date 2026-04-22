/**
 * Express.js middleware for Authbound route protection.
 *
 * @example
 * ```ts
 * import express from 'express';
 * import cookieParser from 'cookie-parser';
 * import { authboundMiddleware } from '@authbound-sdk/server/express';
 *
 * const app = express();
 * app.use(cookieParser());
 *
 * // Protect all routes under /adult-content
 * app.use('/adult-content', authboundMiddleware(config));
 * ```
 */

import type { NextFunction, Request, RequestHandler, Response } from "express";
import type {
  AuthboundConfig,
  AuthboundVerificationContext,
  MiddlewareResult,
  ProtectedRouteConfig,
  VerificationRequirements,
} from "../core/types";
import { checkRequirements, parseConfig } from "../core/types";
import { getVerificationFromCookie } from "./cookies";

// ============================================================================
// Types
// ============================================================================

export interface ExpressMiddlewareOptions {
  /**
   * Custom handler for when verification requirements are not met.
   * Call res.redirect() or res.status().send() to override default behavior.
   * If nothing is sent, default redirect will be used.
   */
  onVerificationRequired?: (
    req: Request,
    res: Response,
    result: MiddlewareResult
  ) => void | Promise<void>;

  /**
   * Custom handler to run after verification context validation.
   * Useful for logging or additional checks.
   */
  onVerificationValidated?: (
    req: Request,
    res: Response,
    result: MiddlewareResult
  ) => void | Promise<void>;

  /**
   * Skip middleware for certain paths.
   * Returns true to skip, false to process.
   */
  skip?: (req: Request) => boolean | Promise<boolean>;
}

export type AuthboundMiddleware = RequestHandler;

// Extend Express Request to include Authbound verification context
declare global {
  namespace Express {
    interface Request {
      authboundVerification?: AuthboundVerificationContext | null;
    }
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

function buildVerifyUrl(req: Request, verifyPath: string): string {
  const returnPath = req.originalUrl;
  const url = new URL(verifyPath, `http://${req.get("host")}`);

  if (returnPath !== verifyPath) {
    url.searchParams.set("returnTo", returnPath);
  }

  return url.pathname + url.search;
}

// ============================================================================
// Middleware Factory
// ============================================================================

/**
 * Create an Authbound middleware for Express.js.
 *
 * This middleware protects routes based on the configuration.
 * It checks verification cookies and enforces verification requirements.
 *
 * @example
 * ```ts
 * import express from 'express';
 * import cookieParser from 'cookie-parser';
 * import { authboundMiddleware } from '@authbound-sdk/server/express';
 *
 * const app = express();
 * app.use(cookieParser());
 *
 * app.use('/protected', authboundMiddleware({
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
  options: ExpressMiddlewareOptions = {}
): AuthboundMiddleware {
  const validatedConfig = parseConfig(config);

  return async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    const pathname = req.path;

    try {
      // Check if we should skip this request
      if (options.skip) {
        const shouldSkip = await options.skip(req);
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

      // Get verification context from cookie
      const verification = await getVerificationFromCookie(
        req,
        validatedConfig
      );

      // Attach verification context to request for downstream handlers
      req.authboundVerification = verification;

      // Check requirements
      const requirementsCheck = checkRequirements(
        verification,
        matchingRoute.requirements
      );

      const result: MiddlewareResult = {
        allowed: requirementsCheck.met,
        verification: verification ?? undefined,
        reason: requirementsCheck.reason,
        redirectUrl: requirementsCheck.met
          ? undefined
          : buildVerifyUrl(req, validatedConfig.routes.verify),
      };

      // Call verification validated hook
      if (options.onVerificationValidated) {
        await options.onVerificationValidated(req, res, result);
      }

      // If requirements are met, allow through
      if (result.allowed) {
        // Add verification data to response headers
        if (verification) {
          res.setHeader(
            "x-authbound-verified",
            verification.isVerified.toString()
          );
          res.setHeader("x-authbound-status", verification.status);
          res.setHeader(
            "x-authbound-verification-id",
            verification.verificationId
          );
        }

        return next();
      }

      // Requirements not met - handle redirect
      if (options.onVerificationRequired) {
        await options.onVerificationRequired(req, res, result);

        // If response was already sent, don't continue
        if (res.headersSent) {
          return;
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
      res.redirect(302, result.redirectUrl!);
    } catch (error) {
      if (validatedConfig.debug) {
        console.error("[Authbound] Middleware error:", error);
      }
      next(error);
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
 * // Protect a specific route
 * app.get('/adult-content', withAuthbound(config, { minAge: 18 }), (req, res) => {
 *   res.send('Adult content here');
 * });
 * ```
 */
export function withAuthbound(
  config: AuthboundConfig,
  requirements: VerificationRequirements,
  options: ExpressMiddlewareOptions = {}
): AuthboundMiddleware {
  const validatedConfig = parseConfig(config);

  return async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      // Check if we should skip
      if (options.skip) {
        const shouldSkip = await options.skip(req);
        if (shouldSkip) {
          return next();
        }
      }

      // Get verification context from cookie
      const verification = await getVerificationFromCookie(
        req,
        validatedConfig
      );
      req.authboundVerification = verification;

      // Check requirements
      const requirementsCheck = checkRequirements(verification, requirements);

      const result: MiddlewareResult = {
        allowed: requirementsCheck.met,
        verification: verification ?? undefined,
        reason: requirementsCheck.reason,
        redirectUrl: requirementsCheck.met
          ? undefined
          : buildVerifyUrl(req, validatedConfig.routes.verify),
      };

      // Call verification validated hook
      if (options.onVerificationValidated) {
        await options.onVerificationValidated(req, res, result);
      }

      // If requirements are met, allow through
      if (result.allowed) {
        if (verification) {
          res.setHeader(
            "x-authbound-verified",
            verification.isVerified.toString()
          );
          res.setHeader("x-authbound-status", verification.status);
          res.setHeader(
            "x-authbound-verification-id",
            verification.verificationId
          );
        }
        return next();
      }

      // Handle verification required
      if (options.onVerificationRequired) {
        await options.onVerificationRequired(req, res, result);
        if (res.headersSent) {
          return;
        }
      }

      // Debug logging
      if (validatedConfig.debug) {
        console.log("[Authbound] Redirecting to verification:", {
          path: req.path,
          reason: result.reason,
        });
      }

      // Default redirect
      res.redirect(302, result.redirectUrl!);
    } catch (error) {
      if (validatedConfig.debug) {
        console.error("[Authbound] Middleware error:", error);
      }
      next(error);
    }
  };
}
