/**
 * API service for QuickID session management
 */

export interface CreateSessionRequest {
  customer_user_ref?: string;
}

export interface CreateSessionResponse {
  client_token: string;
  session_id?: string;
  expires_at?: string;
}

/**
 * Creates a QuickID verification session.
 *
 * ⚠️ SECURITY WARNING:
 * This direct call to the QuickID backend is for DEMO PURPOSES ONLY.
 * In production, this should call your own backend proxy endpoint.
 */
export async function createSession(
  request?: CreateSessionRequest
): Promise<CreateSessionResponse> {
  const API_URL = import.meta.env.VITE_QUICKID_API_URL;
  const API_KEY = import.meta.env.VITE_QUICKID_API_KEY;

  // Fallback to mock if env vars are missing (e.g. in CI/CD or initial setup)
  if (!(API_URL && API_KEY)) {
    console.warn(
      "Missing VITE_QUICKID_API_URL or VITE_QUICKID_API_KEY. Using mock token."
    );
    return new Promise((resolve) => {
      setTimeout(() => {
        resolve({
          client_token:
            "mock_client_token_" + Math.random().toString(36).substring(2, 9),
        });
      }, 500);
    });
  }

  const res = await fetch(`${API_URL}/sessions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Authbound-Key": API_KEY,
    },
    body: JSON.stringify({
      customer_user_ref:
        request?.customer_user_ref || `demo_user_${Date.now()}`,
    }),
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(
      `Failed to create session (${res.status}): ${errorText || res.statusText}`
    );
  }

  const data = await res.json();

  if (!data.client_token) {
    throw new Error("Invalid response: missing client_token");
  }

  return data;
}
