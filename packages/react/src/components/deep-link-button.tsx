"use client";

import {
  buildDeepLink,
  buildOpenID4VPDeepLink,
  detectMobilePlatform,
  supportsDeepLinks,
  type WalletHandoffKind,
  type WalletScheme,
} from "@authbound/core";
import * as React from "react";

// ============================================================================
// Types
// ============================================================================

export interface DeepLinkButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /**
   * Authorization request URL from the verification.
   * This is the URL that the wallet app will use to fetch the verification request.
   */
  authorizationRequestUrl: string;

  /**
   * Prebuilt wallet deep link from Authbound.
   * Prefer this when the verification response includes one.
   */
  deepLink?: string;

  /**
   * Wallet handoff payload kind returned by Authbound.
   * Request blobs are QR-only unless Authbound also provides a deep link.
   */
  walletHandoffKind?: WalletHandoffKind;

  /**
   * Verification ID for tracking (optional, used for analytics).
   */
  verificationId?: string;

  /**
   * Wallet scheme to use for the deep link.
   * @default "openid4vp"
   */
  scheme?: WalletScheme | "openid4vp";

  /**
   * Whether to show the button on desktop.
   * Deep links typically only work on mobile devices.
   * @default false
   */
  showOnDesktop?: boolean;

  /**
   * Callback when the deep link is triggered.
   */
  onOpen?: () => void;

  /**
   * Custom class name for styling.
   */
  className?: string;

  /**
   * Button content. Defaults to "Open Wallet".
   */
  children?: React.ReactNode;
}

// ============================================================================
// Component
// ============================================================================

/**
 * Button that triggers deep link to open the wallet app on mobile devices.
 *
 * Automatically detects the platform and uses the appropriate URL scheme.
 * By default, the button is hidden on desktop devices since deep links
 * typically only work on mobile.
 *
 * @example
 * ```tsx
 * <DeepLinkButton
 *   authorizationRequestUrl={verification.authorizationRequestUrl}
 *   deepLink={verification.deepLink}
 *   verificationId={verification.verificationId}
 *   walletHandoffKind={verification.walletHandoffKind}
 * >
 *   Open in Wallet
 * </DeepLinkButton>
 * ```
 *
 * @example With custom styling
 * ```tsx
 * <DeepLinkButton
 *   authorizationRequestUrl={arUrl}
 *   className="bg-blue-600 text-white px-4 py-2 rounded-lg"
 *   showOnDesktop={true}
 * >
 *   Launch EU Wallet
 * </DeepLinkButton>
 * ```
 */
export function DeepLinkButton({
  authorizationRequestUrl,
  deepLink: providedDeepLink,
  walletHandoffKind,
  verificationId,
  scheme = "openid4vp",
  showOnDesktop = false,
  onOpen,
  className,
  children = "Open Wallet",
  disabled,
  ...props
}: DeepLinkButtonProps) {
  const [isMobile, setIsMobile] = React.useState<boolean | null>(null);
  const [isOpening, setIsOpening] = React.useState(false);

  // Detect mobile platform on mount
  React.useEffect(() => {
    const platform = detectMobilePlatform();
    setIsMobile(platform !== "other" && supportsDeepLinks());
  }, []);

  // Don't render on desktop unless explicitly requested
  if (isMobile === false && !showOnDesktop) {
    return null;
  }

  // During SSR or before detection, render nothing to avoid hydration mismatch
  if (isMobile === null) {
    return null;
  }

  if (walletHandoffKind === "request_blob" && !providedDeepLink) {
    return null;
  }

  const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();

    if (disabled || isOpening) return;

    setIsOpening(true);

    const deepLink =
      providedDeepLink ??
      (scheme === "openid4vp"
        ? buildOpenID4VPDeepLink(authorizationRequestUrl)
        : buildDeepLink(authorizationRequestUrl, { scheme }));

    // Trigger the callback
    onOpen?.();

    // Open the deep link
    // Use window.location.href for better compatibility across mobile browsers
    window.location.href = deepLink;

    // Reset after a short delay (in case the app doesn't open)
    setTimeout(() => {
      setIsOpening(false);
    }, 2000);
  };

  return (
    <button
      aria-label={typeof children === "string" ? children : "Open wallet app"}
      className={className}
      data-authbound-deep-link
      data-verification-id={verificationId}
      disabled={disabled || isOpening}
      onClick={handleClick}
      type="button"
      {...props}
    >
      {children}
    </button>
  );
}

// ============================================================================
// Utility Hook
// ============================================================================

/**
 * Hook to check if deep links are supported on the current device.
 *
 * @example
 * ```tsx
 * function MyComponent() {
 *   const { isMobile, isSupported, platform } = useDeepLinkSupport();
 *
 *   if (!isSupported) {
 *     return <p>Scan the QR code with your wallet app</p>;
 *   }
 *
 *   return <DeepLinkButton {...props} />;
 * }
 * ```
 */
export function useDeepLinkSupport() {
  const [state, setState] = React.useState<{
    isMobile: boolean | null;
    isSupported: boolean;
    platform: "ios" | "android" | "other" | null;
  }>({
    isMobile: null,
    isSupported: false,
    platform: null,
  });

  React.useEffect(() => {
    const platform = detectMobilePlatform();
    const isSupported = supportsDeepLinks();

    setState({
      isMobile: platform !== "other",
      isSupported,
      platform,
    });
  }, []);

  return state;
}
