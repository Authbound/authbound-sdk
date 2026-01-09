/**
 * Deep link generation for mobile wallet apps.
 *
 * Deep links allow direct opening of wallet apps on mobile devices
 * for a seamless verification experience.
 */

import {
  detectMobilePlatform as detectMobilePlatformUtil,
  supportsDeepLinks as supportsDeepLinksUtil,
  canOpenDeepLink as canOpenDeepLinkUtil,
} from "../utils/platform";

// ============================================================================
// Deep Link Schemes
// ============================================================================

/**
 * Known wallet deep link schemes.
 */
export const WALLET_SCHEMES = {
  /** Generic EUDI Wallet scheme */
  EUDI: "eudi-wallet",
  /** Authbound universal scheme */
  AUTHBOUND: "authbound",
  /** OpenID4VP scheme (standard) */
  OPENID4VP: "openid4vp",
} as const;

export type WalletScheme = (typeof WALLET_SCHEMES)[keyof typeof WALLET_SCHEMES];

// ============================================================================
// Deep Link Builder
// ============================================================================

/**
 * Build a deep link for opening the wallet app directly.
 *
 * @example
 * ```ts
 * const deepLink = buildDeepLink(authorizationRequestUrl);
 * // Returns: "eudi-wallet://verify?request_uri=..."
 * ```
 */
export function buildDeepLink(
  authorizationRequestUrl: string,
  options: {
    scheme?: WalletScheme;
    action?: string;
  } = {}
): string {
  const { scheme = WALLET_SCHEMES.EUDI, action = "verify" } = options;

  // Parse the authorization request URL to extract parameters
  const arUrl = new URL(authorizationRequestUrl);

  // Build deep link URL
  const deepLink = new URL(`${scheme}://${action}`);

  // If it's a request_uri reference, pass it through
  if (arUrl.searchParams.has("request_uri")) {
    deepLink.searchParams.set(
      "request_uri",
      arUrl.searchParams.get("request_uri")!
    );
  } else {
    // Otherwise, encode the full URL
    deepLink.searchParams.set("request_uri", authorizationRequestUrl);
  }

  return deepLink.toString();
}

/**
 * Build an OpenID4VP deep link (standard format).
 *
 * This follows the OpenID4VP specification for wallet invocation.
 */
export function buildOpenID4VPDeepLink(authorizationRequestUrl: string): string {
  // OpenID4VP uses the openid4vp:// scheme with the full URL
  return `openid4vp://?${new URL(authorizationRequestUrl).search.slice(1)}`;
}

/**
 * Build a custom scheme deep link.
 *
 * Use this for wallets with custom URL schemes.
 */
export function buildCustomDeepLink(
  authorizationRequestUrl: string,
  scheme: string,
  path: string = ""
): string {
  const deepLink = new URL(`${scheme}://${path}`);
  deepLink.searchParams.set("request_uri", authorizationRequestUrl);
  return deepLink.toString();
}

// ============================================================================
// Platform Detection (re-exported from shared utils)
// ============================================================================

/**
 * Detect if the current platform supports deep links.
 */
export const supportsDeepLinks = supportsDeepLinksUtil;

/**
 * Detect the current mobile platform.
 */
export const detectMobilePlatform = detectMobilePlatformUtil;

/**
 * Check if a deep link scheme is likely registered on the device.
 *
 * Note: This is a best-effort check and may not be accurate on all platforms.
 */
export const canOpenDeepLink = canOpenDeepLinkUtil;
