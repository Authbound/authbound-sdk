import { authboundMiddleware } from "@authbound-sdk/server/next";
import { authboundConfig } from "./authbound.config";

/**
 * Authbound Middleware
 *
 * This middleware runs on every matched route and:
 * 1. Checks for a valid session cookie
 * 2. Validates verification requirements for the route
 * 3. Redirects to /verify if requirements are not met
 *
 * @see https://nextjs.org/docs/app/building-your-application/routing/middleware
 */
export default authboundMiddleware(authboundConfig, {
  // Optional: Custom handler when verification is required
  onVerificationRequired: async (request, result) => {
    // You can add custom logging here
    console.log(
      `[Authbound] Verification required for ${request.nextUrl.pathname}`,
      {
        reason: result.reason,
        hasSession: !!result.session,
      }
    );

    // Return undefined to use default redirect behavior
    // Or return a custom Response/NextResponse
    return;
  },

  // Optional: Skip middleware for certain paths
  skip: (request) => {
    // Skip for API routes (they have their own auth)
    if (request.nextUrl.pathname.startsWith("/api/")) {
      return true;
    }
    return false;
  },
});

/**
 * Configure which routes the middleware should run on.
 * This should match the paths defined in authboundConfig.routes.protected
 */
export const config = {
  matcher: [
    "/dashboard/:path*",
    "/premium/:path*",
    "/adult/:path*",
    "/members/:path*",
  ],
};
