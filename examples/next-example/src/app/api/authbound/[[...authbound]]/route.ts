import { createAuthboundHandlers } from "@authbound/nextjs/server";
import { authboundConfig } from "@/authbound.config";

/**
 * Authbound API Route Handler
 *
 * This catch-all route handles:
 * - POST /api/authbound/verification - Create a new verification
 * - POST /api/authbound/session - Finalize the browser session
 * - POST /api/authbound/webhook - Webhook from Authbound
 * - GET /api/authbound/status - Get current verification status
 * - DELETE /api/authbound - Sign out (clear cookie)
 */
export const { GET, POST, DELETE } = createAuthboundHandlers(authboundConfig, {
  // A customer-controlled EUDI verifier starts a wallet request only for an
  // explicit HAIP request: a signed request object by reference and an
  // encrypted direct_post.jwt response.
  ...(process.env.AUTHBOUND_EUDI_PROFILE === "haip"
    ? {
        providerOptions: {
          eudi: {
            profile: "haip",
            responseMode: "direct_post.jwt",
            jarMode: "by_reference",
            requestUriMethod: "get",
          },
        },
      }
    : {}),

  onWebhook: async (event) => {
    const verification = event.data.object;
    console.log("[Authbound] Webhook received:", {
      eventType: event.type,
      verificationId: verification.id,
      status: verification.status,
      userRef: verification.customer_user_ref,
    });
  },

  onVerificationCreated: async (response) => {
    console.log("[Authbound] Verification created:", response.verificationId);
  },
});
