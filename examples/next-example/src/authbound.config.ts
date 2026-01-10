import type { AuthboundConfig } from "@authbound-sdk/server/next";

/**
 * Authbound SDK configuration.
 *
 * This configuration defines:
 * - API credentials for the Authbound service
 * - Protected routes and their verification requirements
 * - Cookie settings for session management
 */
export const authboundConfig: AuthboundConfig = {
  // Your Authbound API key (keep this secret!)
  apiKey: process.env.AUTHBOUND_API_KEY || "",

  // Secret for encrypting the session cookie (min 32 chars)
  secret: process.env.AUTHBOUND_SECRET || "your-secret-key-at-least-32-chars!",

  // Optional: Custom API URL (defaults to https://api.authbound.com)
  apiUrl: process.env.AUTHBOUND_API_URL,

  // Enable debug logging in development
  debug: process.env.NODE_ENV === "development",

  // Cookie configuration
  cookie: {
    name: "__authbound",
    maxAge: 60 * 60 * 24 * 7, // 7 days
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
  },

  // Route protection configuration
  routes: {
    // Protected routes with their requirements
    protected: [
      // Dashboard requires verified identity
      {
        path: "/dashboard",
        requirements: {
          verified: true,
        },
      },
      // Premium content requires verified identity with substantial assurance
      {
        path: "/premium",
        requirements: {
          verified: true,
          assuranceLevel: "SUBSTANTIAL",
        },
      },
      // Adult content requires age verification (18+)
      {
        path: "/adult",
        requirements: {
          minAge: 18,
        },
      },
      // Some content only requires low assurance (e.g., just liveness check)
      {
        path: "/members",
        requirements: {
          verified: true,
          assuranceLevel: "LOW",
        },
      },
    ],

    // Page to redirect users for verification
    verify: "/verify",

    // Webhook callback endpoint
    callback: "/api/authbound/callback",
  },
};
