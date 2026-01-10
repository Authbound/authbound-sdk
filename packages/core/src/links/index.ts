/**
 * Link generation exports.
 */

// Re-export platform utilities for convenience
export {
  detectPlatform,
  isAndroid,
  isBrowser,
  isDesktop,
  isIOS,
  isMobile,
  isServer,
  type MobilePlatform,
  type Platform,
} from "../utils/platform";
export {
  buildCustomDeepLink,
  buildDeepLink,
  buildOpenID4VPDeepLink,
  canOpenDeepLink,
  detectMobilePlatform,
  supportsDeepLinks,
  WALLET_SCHEMES,
  type WalletScheme,
} from "./deep-link";
export {
  buildSmartLink,
  buildUniversalLink,
  buildWalletUniversalLink,
  getAppStoreLink,
  UNIVERSAL_LINK_BASE,
  type UniversalLinkOptions,
  WALLET_APP_STORES,
} from "./universal-link";
