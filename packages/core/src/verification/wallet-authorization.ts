export type WalletClientAction = {
  kind?: string;
  data?: string;
  expiresAt?: string;
  expires_at?: string;
};

export type WalletAuthorizationRequestInput = {
  authorizationRequestUrl?: unknown;
  deepLink?: unknown;
  verification_url?: unknown;
  verificationUrl?: unknown;
  client_action?: unknown;
  clientAction?: unknown;
};

export type WalletAuthorizationRequestResolution = {
  authorizationRequestUrl?: string;
  deepLink?: string;
};

function getString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function getClientAction(value: unknown): WalletClientAction | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as WalletClientAction)
    : undefined;
}

function parseUrl(value: string): URL | undefined {
  try {
    return new URL(value);
  } catch {
    return;
  }
}

function isOpenId4VpScheme(scheme: string): boolean {
  return scheme === "openid4vp" || scheme.endsWith("-openid4vp");
}

function isWalletInvocationUrl(value: string): boolean {
  const url = parseUrl(value);
  if (!url) {
    return false;
  }

  const scheme = url.protocol.slice(0, -1).toLowerCase();
  if (isOpenId4VpScheme(scheme)) {
    return true;
  }

  if (scheme !== "http" && scheme !== "https") {
    return false;
  }

  return url.searchParams.has("request_uri") || url.searchParams.has("request");
}

function getClientActionUrl(
  clientAction: WalletClientAction | undefined
): string | undefined {
  const data = getString(clientAction?.data);
  if (!(data && isWalletInvocationUrl(data))) {
    return;
  }

  return clientAction?.kind === "qr" ||
    clientAction?.kind === "link" ||
    clientAction?.kind === "request_blob"
    ? data
    : undefined;
}

/**
 * Resolve the wallet invocation payload that should be encoded in QR codes.
 */
export function resolveWalletAuthorizationRequest(
  input: WalletAuthorizationRequestInput
): WalletAuthorizationRequestResolution {
  const explicitAuthorizationRequestUrl = getString(
    input.authorizationRequestUrl
  );
  const clientAction = getClientAction(
    input.client_action ?? input.clientAction
  );
  const clientActionUrl = getClientActionUrl(clientAction);
  const normalizedAuthorizationRequestUrl =
    explicitAuthorizationRequestUrl &&
    isWalletInvocationUrl(explicitAuthorizationRequestUrl)
      ? explicitAuthorizationRequestUrl
      : undefined;
  const authorizationRequestUrl =
    normalizedAuthorizationRequestUrl ?? clientActionUrl;
  const explicitDeepLink = getString(input.deepLink);

  return {
    ...(authorizationRequestUrl ? { authorizationRequestUrl } : {}),
    ...(explicitDeepLink || clientActionUrl
      ? { deepLink: explicitDeepLink ?? clientActionUrl }
      : {}),
  };
}
