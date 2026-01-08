import { createAuthboundHandlers } from "@authbound/server/next";
import { authboundConfig } from "@/authbound.config";

/**
 * Authbound API Route Handler
 *
 * This catch-all route handles:
 * - POST /api/authbound - Create a new verification session
 * - POST /api/authbound/callback - Webhook from Authbound (sets cookie)
 * - GET /api/authbound/status - Get current verification status
 * - DELETE /api/authbound - Sign out (clear cookie)
 *
 * @see https://nextjs.org/docs/app/building-your-application/routing/route-handlers
 */
export const { GET, POST, DELETE } = createAuthboundHandlers(authboundConfig, {
  // Called when a webhook is received
  onWebhook: async (event) => {
    const session = event.data.object;
    console.log("[Authbound] Webhook received:", {
      eventType: event.type,
      sessionId: session.id,
      status: session.status,
      userRef: session.client_reference_id,
    });

    // Here you can:
    // - Update your database with the verification result
    // - Send notifications
    // - Trigger workflows
  },

  // Called when a new session is created
  onSessionCreated: async (response) => {
    console.log("[Authbound] Session created:", response.sessionId);
  },

  // Optional: Get user reference from your auth system
  // This ties the verification to your existing user
  getUserRef: async (request) => {
    // Example: Get from your auth session
    // const session = await getServerSession();
    // return session?.user?.id;

    // For demo, generate a random ref
    return `user_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  },
});

