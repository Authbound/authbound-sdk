import { resolveWalletHandoff } from "@authbound/core";
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
    expires_at?: string;
  };
  expires_at?: string;
  expiresAt?: string;
  deepLink?: string;
};

export function mapGatewayVerificationResponse(
  raw: GatewayVerificationResponse
) {
  const handoff = resolveWalletHandoff({
    authorizationRequestUrl: raw.authorizationRequestUrl,
    deepLink: raw.deepLink,
    verification_url: raw.verification_url,
    client_action: raw.client_action,
  });

  if (!handoff.walletInvocationUrl) {
    throw createError({
      statusCode: 502,
      message:
        "Authbound did not return a wallet invocation URL for this verification.",
    });
  }

  return {
    verificationId: raw.verificationId ?? raw.id,
    authorizationRequestUrl: handoff.walletInvocationUrl,
    clientToken: raw.clientToken ?? raw.client_token,
    expiresAt: raw.expiresAt ?? raw.expires_at ?? handoff.expiresAt,
    deepLink: handoff.deepLink,
  };
}
