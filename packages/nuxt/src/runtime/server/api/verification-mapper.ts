import { createError } from "h3";

export type GatewayVerificationResponse = {
  id?: string;
  verificationId?: string;
  client_token?: string;
  clientToken?: string;
  verification_url?: string;
  authorizationRequestUrl?: string;
  client_action?: {
    kind?: string;
    data?: string;
  };
  expires_at?: string;
  expiresAt?: string;
  deepLink?: string;
};

export function mapGatewayVerificationResponse(
  raw: GatewayVerificationResponse
) {
  const linkAction =
    raw.client_action?.kind === "link" ? raw.client_action.data : undefined;
  const authorizationRequestUrl =
    raw.authorizationRequestUrl ?? raw.verification_url ?? linkAction;

  if (!authorizationRequestUrl) {
    throw createError({
      statusCode: 502,
      message:
        "Authbound did not return a browser-compatible wallet URL for this verification.",
    });
  }

  return {
    verificationId: raw.verificationId ?? raw.id,
    authorizationRequestUrl,
    clientToken: raw.clientToken ?? raw.client_token,
    expiresAt: raw.expiresAt ?? raw.expires_at,
    deepLink: raw.deepLink ?? linkAction,
  };
}
