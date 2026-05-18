import { resolveWalletHandoff } from "@authbound/core";
import type { CreateVerificationResponse } from "./types";

export class BrowserVerificationResponseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BrowserVerificationResponseError";
  }
}

export class BrowserWalletUrlError extends BrowserVerificationResponseError {
  constructor() {
    super(
      "Authbound did not return a wallet invocation URL for this verification."
    );
    this.name = "BrowserWalletUrlError";
  }
}

export type BrowserVerificationSource = {
  id: string;
  authorizationRequestUrl?: string;
  deepLink?: string;
  clientToken?: string;
  expiresAt?: string;
  verificationUrl?: string;
  clientAction?: {
    kind?: string;
    data?: string;
    expiresAt?: string;
    expires_at?: string;
  };
};

export function toBrowserVerificationResponse(
  verification: BrowserVerificationSource
): CreateVerificationResponse {
  if (!verification.id) {
    throw new BrowserVerificationResponseError(
      "Authbound did not return a verification id."
    );
  }

  const handoff = resolveWalletHandoff({
    authorizationRequestUrl: verification.authorizationRequestUrl,
    deepLink: verification.deepLink,
    verificationUrl: verification.verificationUrl,
    clientAction: verification.clientAction,
  });

  const walletHandoffPayload = handoff.qrPayload ?? handoff.walletInvocationUrl;

  if (!walletHandoffPayload) {
    throw new BrowserWalletUrlError();
  }

  if (!verification.clientToken) {
    throw new BrowserVerificationResponseError(
      "Authbound did not return a client token for this verification."
    );
  }

  const expiresAt = verification.expiresAt ?? handoff.expiresAt;
  if (!expiresAt) {
    throw new BrowserVerificationResponseError(
      "Authbound did not return an expiry for this verification."
    );
  }

  return {
    verificationId: verification.id,
    authorizationRequestUrl: walletHandoffPayload,
    clientToken: verification.clientToken,
    expiresAt,
    ...(handoff.deepLink ? { deepLink: handoff.deepLink } : {}),
    ...(handoff.kind === "request_blob"
      ? { walletHandoffKind: handoff.kind }
      : {}),
  };
}
