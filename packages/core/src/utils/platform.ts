/**
 * Platform detection utilities.
 *
 * Shared utilities for detecting the current platform and capabilities.
 */

// ============================================================================
// Types
// ============================================================================

/**
 * Platform types for mobile-specific detection.
 */
export type MobilePlatform = "ios" | "android" | "other";

/**
 * Extended platform types including desktop.
 */
export type Platform = "ios" | "android" | "desktop";

/**
 * Device type classification.
 */
export type DeviceType = "mobile" | "tablet" | "desktop";

// ============================================================================
// Platform Detection
// ============================================================================

/**
 * Detect the current mobile platform.
 *
 * Returns "other" for non-mobile platforms.
 *
 * @example
 * ```ts
 * const platform = detectMobilePlatform();
 * if (platform === 'ios') {
 *   // iOS-specific logic
 * }
 * ```
 */
export function detectMobilePlatform(): MobilePlatform {
  if (typeof window === "undefined" || typeof navigator === "undefined") {
    return "other";
  }

  const ua = navigator.userAgent.toLowerCase();

  if (/iphone|ipad|ipod/.test(ua)) {
    return "ios";
  }

  if (/android/.test(ua)) {
    return "android";
  }

  return "other";
}

/**
 * Detect the current platform including desktop.
 *
 * @example
 * ```ts
 * const platform = detectPlatform();
 * if (platform === 'desktop') {
 *   // Show QR code instead of deep link
 * }
 * ```
 */
export function detectPlatform(): Platform {
  const mobilePlatform = detectMobilePlatform();

  if (mobilePlatform === "other") {
    return "desktop";
  }

  return mobilePlatform;
}

/**
 * Check if the current platform is mobile.
 */
export function isMobile(): boolean {
  return detectMobilePlatform() !== "other";
}

/**
 * Check if the current platform is iOS.
 */
export function isIOS(): boolean {
  return detectMobilePlatform() === "ios";
}

/**
 * Check if the current platform is Android.
 */
export function isAndroid(): boolean {
  return detectMobilePlatform() === "android";
}

/**
 * Check if the current platform is desktop.
 */
export function isDesktop(): boolean {
  return detectPlatform() === "desktop";
}

// ============================================================================
// Feature Detection
// ============================================================================

/**
 * Check if the current platform supports deep links.
 *
 * Deep links are supported on:
 * - iOS (native app schemes)
 * - Android (intent schemes)
 * - Desktop apps that register custom schemes
 */
export function supportsDeepLinks(): boolean {
  if (typeof window === "undefined") {
    return false;
  }

  // Mobile platforms always support deep links
  if (isMobile()) {
    return true;
  }

  // Desktop also supports deep links (for wallet desktop apps)
  const ua = navigator.userAgent.toLowerCase();
  return /macintosh|windows|linux/.test(ua);
}

/**
 * Check if a deep link scheme is likely registered on the device.
 *
 * Note: This is a best-effort check and may not be accurate on all platforms.
 * On iOS, it attempts to detect by checking visibility changes.
 * On other platforms, it returns true (assumes success).
 *
 * @param scheme - The URL scheme to check (e.g., "eudi-wallet")
 * @param timeout - Timeout in milliseconds (default: 1500)
 */
export async function canOpenDeepLink(
  scheme: string,
  timeout = 1500
): Promise<boolean> {
  if (typeof window === "undefined") {
    return false;
  }

  // On iOS, we can try to detect if the scheme is registered
  // by attempting to open it and checking for navigation
  if (isIOS()) {
    return new Promise((resolve) => {
      const start = Date.now();

      const handleVisibilityChange = () => {
        if (document.hidden) {
          // App opened successfully
          document.removeEventListener("visibilitychange", handleVisibilityChange);
          resolve(true);
        }
      };

      document.addEventListener("visibilitychange", handleVisibilityChange);

      // Try to open the scheme
      window.location.href = `${scheme}://`;

      // If we're still here after timeout, scheme is not registered
      setTimeout(() => {
        document.removeEventListener("visibilitychange", handleVisibilityChange);
        if (Date.now() - start >= timeout - 100) {
          resolve(false);
        }
      }, timeout);
    });
  }

  // On other platforms, assume it works
  return true;
}

// ============================================================================
// Browser Detection
// ============================================================================

/**
 * Check if running in a browser environment.
 */
export function isBrowser(): boolean {
  return typeof window !== "undefined" && typeof document !== "undefined";
}

/**
 * Check if running in a server environment (Node.js/Bun).
 */
export function isServer(): boolean {
  return !isBrowser();
}

/**
 * Check if running in Safari browser.
 */
export function isSafari(): boolean {
  if (!isBrowser()) {
    return false;
  }

  const ua = navigator.userAgent.toLowerCase();
  return /safari/.test(ua) && !/chrome|chromium|android/.test(ua);
}

/**
 * Check if running in a WebView (embedded browser).
 */
export function isWebView(): boolean {
  if (!isBrowser()) {
    return false;
  }

  const ua = navigator.userAgent.toLowerCase();

  // iOS WebView detection
  if (isIOS()) {
    // Safari has "Safari" in UA, WebView doesn't
    return !(/safari/.test(ua));
  }

  // Android WebView detection
  if (isAndroid()) {
    // Android WebView has "wv" or specific app identifiers
    return /wv|.android.+version\/\d/.test(ua);
  }

  return false;
}
