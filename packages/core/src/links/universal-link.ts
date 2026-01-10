/**
 * Universal link generation for cross-platform wallet invocation.
 *
 * Universal links work on both mobile and desktop, redirecting to
 * the appropriate app or web fallback.
 */

import {
  detectPlatform as detectPlatformUtil,
  type Platform,
} from "../utils/platform";

// ============================================================================
// Universal Link Configuration
// ============================================================================

/**
 * Default universal link base URL.
 */
export const UNIVERSAL_LINK_BASE = "https://link.authbound.io";

/**
 * Universal link options.
 */
export interface UniversalLinkOptions {
  /** Base URL for universal links (default: https://link.authbound.io) */
  baseUrl?: string;
  /** Path for verification links */
  path?: string;
  /** Fallback URL if app is not installed */
  fallbackUrl?: string;
  /** Additional parameters to include */
  params?: Record<string, string>;
}

// ============================================================================
// Universal Link Builder
// ============================================================================

/**
 * Build a universal link that works across platforms.
 *
 * Universal links:
 * - Open the wallet app if installed (iOS/Android)
 * - Redirect to a web fallback if not installed
 * - Work on desktop by showing a QR code or download prompt
 *
 * @example
 * ```ts
 * const universalLink = buildUniversalLink(authorizationRequestUrl);
 * // Returns: "https://link.authbound.io/v?ar=..."
 * ```
 */
export function buildUniversalLink(
  authorizationRequestUrl: string,
  options: UniversalLinkOptions = {}
): string {
  const {
    baseUrl = UNIVERSAL_LINK_BASE,
    path = "/v",
    fallbackUrl,
    params = {},
  } = options;

  const url = new URL(path, baseUrl);

  // Encode the authorization request URL
  url.searchParams.set("ar", authorizationRequestUrl);

  // Add fallback URL if provided
  if (fallbackUrl) {
    url.searchParams.set("fallback", fallbackUrl);
  }

  // Add any additional parameters
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }

  return url.toString();
}

/**
 * Build a universal link with a specific wallet preference.
 *
 * @example
 * ```ts
 * const link = buildWalletUniversalLink(authorizationRequestUrl, {
 *   preferredWallet: 'eudi-reference',
 * });
 * ```
 */
export function buildWalletUniversalLink(
  authorizationRequestUrl: string,
  options: UniversalLinkOptions & {
    /** Preferred wallet ID */
    preferredWallet?: string;
  } = {}
): string {
  const { preferredWallet, ...rest } = options;

  const params = { ...rest.params };
  if (preferredWallet) {
    params["wallet"] = preferredWallet;
  }

  return buildUniversalLink(authorizationRequestUrl, {
    ...rest,
    params,
  });
}

// ============================================================================
// App Store Links
// ============================================================================

/**
 * Known wallet app store links.
 */
export const WALLET_APP_STORES = {
  /** EUDI Reference Wallet - iOS */
  EUDI_IOS:
    "https://apps.apple.com/app/eu-digital-identity-wallet/id6478828617",
  /** EUDI Reference Wallet - Android */
  EUDI_ANDROID:
    "https://play.google.com/store/apps/details?id=eu.europa.ec.eudi.wallet",
} as const;

/**
 * Get the appropriate app store link for the current platform.
 */
export function getAppStoreLink(platform?: Platform): string | null {
  if (typeof window === "undefined") return null;

  const detectedPlatform = platform ?? detectPlatformUtil();

  switch (detectedPlatform) {
    case "ios":
      return WALLET_APP_STORES.EUDI_IOS;
    case "android":
      return WALLET_APP_STORES.EUDI_ANDROID;
    default:
      return null;
  }
}

// ============================================================================
// Smart Link Builder
// ============================================================================

/**
 * Build the optimal link for the current platform.
 *
 * - Mobile: Universal link that opens app or falls back to store
 * - Desktop: Universal link with QR code display
 *
 * @example
 * ```ts
 * const link = buildSmartLink(authorizationRequestUrl);
 * // Returns the best link for the current platform
 * ```
 */
export function buildSmartLink(
  authorizationRequestUrl: string,
  options: UniversalLinkOptions & {
    /** Include app store fallback for mobile */
    includeStoreFallback?: boolean;
    /** Custom fallback URL for desktop */
    desktopFallbackUrl?: string;
  } = {}
): {
  /** The link to use */
  link: string;
  /** The detected platform */
  platform: Platform;
  /** Whether QR code should be shown */
  showQR: boolean;
  /** App store link if applicable */
  appStoreLink: string | null;
} {
  const platform = detectPlatformUtil();
  const appStoreLink =
    platform === "desktop" ? null : getAppStoreLink(platform);

  // For mobile, use universal link with store fallback
  if (platform === "ios" || platform === "android") {
    const fallbackUrl = options.includeStoreFallback
      ? (appStoreLink ?? options.fallbackUrl)
      : options.fallbackUrl;

    return {
      link: buildUniversalLink(authorizationRequestUrl, {
        ...options,
        fallbackUrl,
      }),
      platform,
      showQR: false,
      appStoreLink,
    };
  }

  // For desktop, show QR code
  return {
    link: buildUniversalLink(authorizationRequestUrl, {
      ...options,
      fallbackUrl: options.desktopFallbackUrl ?? options.fallbackUrl,
    }),
    platform: "desktop",
    showQR: true,
    appStoreLink: null,
  };
}
