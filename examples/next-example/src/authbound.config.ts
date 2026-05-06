import type { AuthboundConfig } from "@authbound/nextjs/server";

/**
 * Authbound SDK configuration.
 *
 * Authbound SDK configuration.
 */
export const authboundConfig: AuthboundConfig = {
  apiKey: process.env.AUTHBOUND_SECRET_KEY || "",
  publishableKey: process.env.NEXT_PUBLIC_AUTHBOUND_PK,
  secret:
    process.env.AUTHBOUND_SESSION_SECRET ||
    "your-cookie-secret-at-least-32-chars",
  webhookSecret: process.env.AUTHBOUND_WEBHOOK_SECRET,
  apiUrl: process.env.AUTHBOUND_API_URL,
  debug: process.env.NODE_ENV === "development",
  cookie: {
    name: "__authbound",
    maxAge: 60 * 60 * 24 * 7,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
  },
  routes: {
    protected: [
      {
        path: "/dashboard",
        requirements: {
          verified: true,
        },
      },
      {
        path: "/premium",
        requirements: {
          verified: true,
          assuranceLevel: "SUBSTANTIAL",
        },
      },
      {
        path: "/adult",
        requirements: {
          minAge: 18,
        },
      },
      {
        path: "/members",
        requirements: {
          verified: true,
          assuranceLevel: "LOW",
        },
      },
    ],
    verify: "/verify",
    callback: "/api/authbound/webhook",
  },
};
