/**
 * Link generation exports.
 */

export {
  buildDeepLink,
  buildOpenID4VPDeepLink,
  buildCustomDeepLink,
  supportsDeepLinks,
  detectMobilePlatform,
  canOpenDeepLink,
  WALLET_SCHEMES,
  type WalletScheme,
} from "./deep-link";

export {
  buildUniversalLink,
  buildWalletUniversalLink,
  buildSmartLink,
  getAppStoreLink,
  UNIVERSAL_LINK_BASE,
  WALLET_APP_STORES,
  type UniversalLinkOptions,
} from "./universal-link";

// Re-export platform utilities for convenience
export {
  detectPlatform,
  type Platform,
  type MobilePlatform,
  isMobile,
  isIOS,
  isAndroid,
  isDesktop,
  isBrowser,
  isServer,
} from "../utils/platform";
