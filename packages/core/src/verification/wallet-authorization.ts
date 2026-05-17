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

export type WalletHandoffResolution = {
  kind?: "qr" | "link" | "request_blob";
  walletInvocationUrl?: string;
  qrPayload?: string;
  deepLink?: string;
  hostedVerificationUrl?: string;
  expiresAt?: string;
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

  return clientAction?.kind === "qr" || clientAction?.kind === "link"
    ? data
    : undefined;
}

function getRequestBlobPayload(
  clientAction: WalletClientAction | undefined
): string | undefined {
  const data = getString(clientAction?.data);
  if (clientAction?.kind !== "request_blob" || !data) {
    return;
  }

  return data;
}

function getClientActionKind(
  clientAction: WalletClientAction | undefined
): WalletHandoffResolution["kind"] | undefined {
  return clientAction?.kind === "qr" ||
    clientAction?.kind === "link" ||
    clientAction?.kind === "request_blob"
    ? clientAction.kind
    : undefined;
}

function getHostedVerificationUrl(
  input: WalletAuthorizationRequestInput
): string | undefined {
  const url =
    getString(input.verification_url) ?? getString(input.verificationUrl);
  if (!url || isWalletInvocationUrl(url)) {
    return;
  }

  const parsed = parseUrl(url);
  const scheme = parsed?.protocol.slice(0, -1).toLowerCase();
  return scheme === "http" || scheme === "https" ? url : undefined;
}

/**
 * Resolve the wallet handoff data from a public verification response.
 *
 * `verification_url` is a browser-hosted fallback page. Wallet QR/deep-link
 * payloads must come from explicit wallet URLs or `client_action.data`.
 */
export function resolveWalletHandoff(
  input: WalletAuthorizationRequestInput
): WalletHandoffResolution {
  const explicitAuthorizationRequestUrl = getString(
    input.authorizationRequestUrl
  );
  const clientAction = getClientAction(
    input.client_action ?? input.clientAction
  );
  const clientActionUrl = getClientActionUrl(clientAction);
  const requestBlobPayload = getRequestBlobPayload(clientAction);
  const explicitWalletUrl =
    explicitAuthorizationRequestUrl &&
    isWalletInvocationUrl(explicitAuthorizationRequestUrl)
      ? explicitAuthorizationRequestUrl
      : undefined;
  const walletInvocationUrl = explicitWalletUrl ?? clientActionUrl;
  const explicitDeepLink = getString(input.deepLink);
  const validExplicitDeepLink =
    explicitDeepLink && isWalletInvocationUrl(explicitDeepLink)
      ? explicitDeepLink
      : undefined;
  const deepLink = validExplicitDeepLink ?? walletInvocationUrl;
  const expiresAt = getString(
    clientAction?.expiresAt ?? clientAction?.expires_at
  );
  const kind = getClientActionKind(clientAction);
  const hostedVerificationUrl = getHostedVerificationUrl(input);

  return {
    ...(kind ? { kind } : {}),
    ...(walletInvocationUrl ? { walletInvocationUrl } : {}),
    ...(requestBlobPayload || walletInvocationUrl
      ? { qrPayload: requestBlobPayload ?? walletInvocationUrl }
      : {}),
    ...(deepLink ? { deepLink } : {}),
    ...(hostedVerificationUrl ? { hostedVerificationUrl } : {}),
    ...(expiresAt ? { expiresAt } : {}),
  };
}

/**
 * Resolve the wallet invocation payload that should be encoded in QR codes.
 */
export function resolveWalletAuthorizationRequest(
  input: WalletAuthorizationRequestInput
): WalletAuthorizationRequestResolution {
  const handoff = resolveWalletHandoff(input);

  return {
    ...(handoff.qrPayload
      ? { authorizationRequestUrl: handoff.qrPayload }
      : {}),
    ...(handoff.deepLink ? { deepLink: handoff.deepLink } : {}),
  };
}
