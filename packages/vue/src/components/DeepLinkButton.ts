/**
 * DeepLinkButton Component - Button to open wallet via deep link.
 *
 * Triggers a deep link on mobile devices to open the wallet app
 * directly for verification.
 */

import {
  buildDeepLink,
  buildOpenID4VPDeepLink,
  detectMobilePlatform,
  supportsDeepLinks,
  type WalletScheme,
} from "@authbound/core";
import { defineComponent, h, onMounted, type PropType, ref } from "vue";

// ============================================================================
// Types
// ============================================================================

export interface DeepLinkButtonProps {
  /**
   * Authorization request URL from the verification session.
   */
  authorizationRequestUrl: string;

  /**
   * Session ID for tracking (optional).
   */
  sessionId?: string;

  /**
   * Wallet scheme to use for the deep link.
   * @default "openid4vp"
   */
  scheme?: WalletScheme | "openid4vp";

  /**
   * Whether to show the button on desktop.
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
  class?: string;
}

// ============================================================================
// Component
// ============================================================================

export const DeepLinkButton = defineComponent({
  name: "AuthboundDeepLinkButton",

  props: {
    authorizationRequestUrl: {
      type: String,
      required: true,
    },
    sessionId: {
      type: String,
      default: undefined,
    },
    scheme: {
      type: String as PropType<WalletScheme | "openid4vp">,
      default: "openid4vp",
    },
    showOnDesktop: {
      type: Boolean,
      default: false,
    },
    onOpen: {
      type: Function as PropType<() => void>,
      default: undefined,
    },
    class: {
      type: String,
      default: undefined,
    },
  },

  setup(props, { slots }) {
    const isMobile = ref<boolean | null>(null);
    const isOpening = ref(false);

    onMounted(() => {
      const platform = detectMobilePlatform();
      isMobile.value = platform !== null && supportsDeepLinks();
    });

    const handleClick = () => {
      if (isOpening.value) return;

      isOpening.value = true;

      // Build the appropriate deep link
      let deepLink: string;
      if (props.scheme === "openid4vp") {
        deepLink = buildOpenID4VPDeepLink(props.authorizationRequestUrl);
      } else {
        deepLink = buildDeepLink(props.authorizationRequestUrl, {
          scheme: props.scheme as WalletScheme,
        });
      }

      // Trigger the callback
      props.onOpen?.();

      // Open the deep link
      window.location.href = deepLink;

      // Reset after a short delay
      setTimeout(() => {
        isOpening.value = false;
      }, 2000);
    };

    return () => {
      // Don't render on desktop unless explicitly requested
      if (isMobile.value === false && !props.showOnDesktop) {
        return null;
      }

      // During SSR or before detection, render nothing
      if (isMobile.value === null) {
        return null;
      }

      return h(
        "button",
        {
          type: "button",
          onClick: handleClick,
          disabled: isOpening.value,
          class: props.class,
          "aria-label": "Open wallet app",
          "data-authbound-deep-link": "",
          "data-session-id": props.sessionId,
        },
        slots.default?.() ?? "Open Wallet"
      );
    };
  },
});
