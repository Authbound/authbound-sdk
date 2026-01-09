/**
 * VerificationWall Component - Full-page verification flow.
 *
 * Displays a complete verification UI that gates content until
 * the user successfully verifies their identity.
 */

import {
  defineComponent,
  h,
  computed,
  type PropType,
  type VNode,
  Fragment,
} from "vue";
import type { CSSProperties } from "vue";
import type { PolicyId, VerificationResult } from "@authbound/core";
import { AuthboundError, asPolicyId } from "@authbound/core";
import { useVerification } from "../composables/useVerification";
import { QRCodeWithLoading } from "./QRCode";
import { VerificationStatus } from "./VerificationStatus";

// ============================================================================
// Component
// ============================================================================

export const VerificationWall = defineComponent({
  name: "AuthboundVerificationWall",

  props: {
    /**
     * Policy ID for verification.
     * Format: "name@version" (e.g., "age-gate-18@1.0.0")
     */
    policyId: {
      type: String,
      default: undefined,
    },
    /** Title text */
    title: {
      type: String,
      default: "Identity Verification Required",
    },
    /** Subtitle text */
    subtitle: {
      type: String,
      default: "Scan the QR code with your EU Digital Identity Wallet to continue",
    },
    /** Auto-start verification on mount */
    autoStart: {
      type: Boolean,
      default: true,
    },
    /** Show retry button on failure */
    showRetry: {
      type: Boolean,
      default: true,
    },
    /** Custom start button text */
    startButtonText: {
      type: String,
      default: "Start Verification",
    },
    /** Custom retry button text */
    retryButtonText: {
      type: String,
      default: "Try Again",
    },
    /** Callback when verified */
    onVerified: {
      type: Function as PropType<(result: VerificationResult) => void>,
      default: undefined,
    },
    /** Callback when failed */
    onFailed: {
      type: Function as PropType<(error: AuthboundError) => void>,
      default: undefined,
    },
  },

  setup(props, { slots }) {
    const {
      status,
      isVerified,
      isFailed,
      authorizationRequestUrl,
      error,
      timeRemaining,
      startVerification,
      retry,
    } = useVerification({
      // Cast string prop to PolicyId - validation happens in asPolicyId
      policyId: props.policyId ? asPolicyId(props.policyId) : undefined,
      autoStart: props.autoStart,
      onVerified: props.onVerified,
      onFailed: props.onFailed,
    });

    // Card styles
    const cardStyle = computed((): CSSProperties => ({
      backgroundColor: "var(--ab-color-background, #ffffff)",
      borderRadius: "var(--ab-radius-lg, 0.75rem)",
      padding: "var(--ab-card-padding, 1.5rem)",
      boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -2px rgba(0, 0, 0, 0.1)",
      maxWidth: "400px",
      width: "100%",
      textAlign: "center",
    }));

    const buttonStyle = computed((): CSSProperties => ({
      backgroundColor: "var(--ab-color-primary, #0058cc)",
      color: "#ffffff",
      border: "none",
      borderRadius: "var(--ab-radius-md, 0.5rem)",
      padding: "0.75rem 1.5rem",
      fontSize: "var(--ab-font-size-base, 1rem)",
      fontWeight: "var(--ab-font-weight-medium, 500)",
      cursor: "pointer",
      transition: "background-color 0.2s ease",
      width: "100%",
      marginTop: "var(--ab-space-4, 1rem)",
    }));

    // Helper to normalize slot content to array
    const normalizeSlot = (slot: VNode | VNode[] | undefined): VNode[] => {
      if (!slot) return [];
      return Array.isArray(slot) ? slot : [slot];
    };

    // Render default header
    const renderDefaultHeader = () =>
      h("div", { class: "ab-wall__header" }, [
        h(
          "h2",
          {
            class: "ab-wall__title",
            style: {
              fontSize: "1.5rem",
              fontWeight: "var(--ab-font-weight-bold, 600)",
              color: "var(--ab-color-foreground, #1a1a1a)",
              margin: "0 0 0.5rem 0",
            } as CSSProperties,
          },
          props.title
        ),
        h(
          "p",
          {
            class: "ab-wall__subtitle",
            style: {
              fontSize: "var(--ab-font-size-sm, 0.875rem)",
              color: "var(--ab-color-muted-foreground, #737373)",
              margin: 0,
            } as CSSProperties,
          },
          props.subtitle
        ),
      ]);

    // Render header with slot support
    const renderHeader = () => {
      const headerSlot = slots.header?.();
      if (headerSlot) {
        return h(Fragment, normalizeSlot(headerSlot));
      }
      return renderDefaultHeader();
    };

    return () => {
      // If verified, render children
      if (isVerified.value) {
        const defaultContent = slots.default?.();
        if (defaultContent) {
          return h(Fragment, normalizeSlot(defaultContent));
        }
        return null;
      }

      // Determine content based on status
      let content: VNode[];

      if (status.value === "idle") {
        // Idle state - show start button
        content = [
          renderHeader(),
          h(
            "button",
            {
              class: "ab-wall__button ab-wall__button--primary",
              style: buttonStyle.value,
              onClick: startVerification,
              type: "button",
            },
            props.startButtonText
          ),
        ];
      } else if (isFailed.value || status.value === "timeout") {
        // Failed/timeout state
        const failedContent: (VNode | false)[] = [
          h(VerificationStatus, {
            status: status.value,
            errorMessage: error.value?.message ?? undefined,
            showTimer: false,
          }),
        ];

        // Retry button
        if (props.showRetry) {
          failedContent.push(
            h(
              "button",
              {
                class: "ab-wall__button ab-wall__button--primary",
                style: buttonStyle.value,
                onClick: retry,
                type: "button",
              },
              props.retryButtonText
            )
          );
        }

        content = failedContent.filter(Boolean) as VNode[];
      } else {
        // Pending/processing state - show QR code
        const qrSlot = slots.qr?.({ url: authorizationRequestUrl.value });
        const qrContent = qrSlot
          ? h(Fragment, normalizeSlot(qrSlot))
          : h(QRCodeWithLoading, {
              value: authorizationRequestUrl.value,
              size: 256,
            });

        content = [
          renderHeader(),
          h(
            "div",
            {
              class: "ab-wall__qr",
              style: {
                display: "flex",
                justifyContent: "center",
                marginTop: "var(--ab-space-6, 1.5rem)",
                marginBottom: "var(--ab-space-4, 1rem)",
              } as CSSProperties,
            },
            [qrContent]
          ),
          h(VerificationStatus, {
            status: status.value,
            timeRemaining: timeRemaining.value ?? undefined,
            showDescription: true,
            showTimer: true,
          }),
        ];
      }

      // Wrapper
      const wrapperStyle: CSSProperties = {
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "100vh",
        padding: "var(--ab-space-4, 1rem)",
        backgroundColor: "var(--ab-color-muted, #f5f5f5)",
        fontFamily: "var(--ab-font-family, system-ui, sans-serif)",
      };

      return h(
        "div",
        {
          class: "ab-wall",
          style: wrapperStyle,
          "data-testid": "authbound-verification-wall",
        },
        [
          h(
            "div",
            {
              class: "ab-wall__card",
              style: cardStyle.value,
            },
            content
          ),
        ]
      );
    };
  },
});

export type VerificationWallProps = InstanceType<typeof VerificationWall>["$props"];
