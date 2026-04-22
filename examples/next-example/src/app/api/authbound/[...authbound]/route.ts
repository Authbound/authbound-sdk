import { createAuthboundHandlers } from "@authbound-sdk/server/next";
import { authboundConfig } from "@/authbound.config";

/**
 * Authbound API Route Handler
 *
 * This catch-all route handles:
 * - POST /api/authbound - Create a new verification
 * - POST /api/authbound/callback - Webhook from Authbound (sets cookie)
 * - GET /api/authbound/status - Get current verification status
 * - DELETE /api/authbound - Sign out (clear cookie)
 *
 * @see https://nextjs.org/docs/app/building-your-application/routing/route-handlers
 */
export const { GET, POST, DELETE } = createAuthboundHandlers(authboundConfig, {
  // Called when a webhook is received
  onWebhook: async (event) => {
    const verification = event.data.object;
    console.log("[Authbound] Webhook received:", {
      eventType: event.type,
      verificationId: verification.id,
      status: verification.status,
      userRef: verification.client_reference_id,
    });

    // Here you can:
    // - Update your database with the verification result
    // - Send notifications
    // - Trigger workflows
  },

  // Called when a new verification is created
  onVerificationCreated: async (response) => {
    console.log("[Authbound] Verification created:", response.verificationId);
  },

  // Optional: Get user reference from your auth system
  // This ties the verification to your existing user
  getUserRef: async (request) => {
    // Example: Get from your auth provider.
    // const session = await getServerSession();
    // return session?.user?.id;

    // For demo, generate a random ref
    return `user_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  },
});
