/**
 * VerificationStatus Component - Displays current verification status.
 */

import type { EudiVerificationStatus } from "@authbound/core";
import type { CSSProperties } from "vue";
import { computed, defineComponent, h, type PropType } from "vue";

// ============================================================================
// Status Configuration
// ============================================================================

interface StatusConfig {
  label: string;
  description: string;
  icon: string;
  color: string;
}

const STATUS_CONFIG: Record<EudiVerificationStatus, StatusConfig> = {
  idle: {
    label: "Ready",
    description: "Ready to start verification",
    icon: "○",
    color: "var(--ab-color-muted-foreground, #737373)",
  },
  pending: {
    label: "Waiting",
    description: "Scan QR code with your wallet",
    icon: "◐",
    color: "var(--ab-color-primary, #0058cc)",
  },
  processing: {
    label: "Processing",
    description: "Verifying your credentials",
    icon: "◑",
    color: "var(--ab-color-primary, #0058cc)",
  },
  verified: {
    label: "Verified",
    description: "Identity verified successfully",
    icon: "✓",
    color: "var(--ab-color-success, #16794f)",
  },
  failed: {
    label: "Failed",
    description: "Verification could not be completed",
    icon: "✗",
    color: "var(--ab-color-error, #b3261e)",
  },
  timeout: {
    label: "Timed Out",
    description: "Session expired, please try again",
    icon: "⏱",
    color: "var(--ab-color-warning, #f59e0b)",
  },
  error: {
    label: "Error",
    description: "An error occurred",
    icon: "!",
    color: "var(--ab-color-error, #b3261e)",
  },
};

// ============================================================================
// StatusBadge Component
// ============================================================================

export const StatusBadge = defineComponent({
  name: "AuthboundStatusBadge",

  props: {
    /** Current status */
    status: {
      type: String as PropType<EudiVerificationStatus>,
      required: true,
    },
    /** Show icon */
    showIcon: {
      type: Boolean,
      default: true,
    },
    /** Variant */
    variant: {
      type: String as PropType<"default" | "outline" | "minimal">,
      default: "default",
    },
    /** Size */
    size: {
      type: String as PropType<"sm" | "md" | "lg">,
      default: "md",
    },
  },

  setup(props) {
    const config = computed(() => STATUS_CONFIG[props.status]);

    const sizeStyles = computed((): CSSProperties => {
      switch (props.size) {
        case "sm":
          return {
            fontSize: "var(--ab-font-size-sm, 0.75rem)",
            padding: "0.125rem 0.5rem",
          };
        case "lg":
          return {
            fontSize: "var(--ab-font-size-lg, 1rem)",
            padding: "0.5rem 1rem",
          };
        default:
          return {
            fontSize: "var(--ab-font-size-base, 0.875rem)",
            padding: "0.25rem 0.75rem",
          };
      }
    });

    const variantStyles = computed((): CSSProperties => {
      const color = config.value.color;
      switch (props.variant) {
        case "outline":
          return {
            backgroundColor: "transparent",
            border: `1px solid ${color}`,
            color,
          };
        case "minimal":
          return {
            backgroundColor: "transparent",
            border: "none",
            color,
          };
        default:
          return {
            backgroundColor: color,
            color: "#ffffff",
          };
      }
    });

    return () => {
      const baseStyle: CSSProperties = {
        display: "inline-flex",
        alignItems: "center",
        gap: "0.375rem",
        borderRadius: "var(--ab-radius-full, 9999px)",
        fontWeight: "var(--ab-font-weight-medium, 500)",
        ...sizeStyles.value,
        ...variantStyles.value,
      };

      return h(
        "span",
        {
          class: [
            "ab-status-badge",
            `ab-status-badge--${props.status}`,
            `ab-status-badge--${props.variant}`,
            `ab-status-badge--${props.size}`,
          ].join(" "),
          style: baseStyle,
          "data-status": props.status,
        },
        [
          props.showIcon &&
            h(
              "span",
              {
                class: "ab-status-badge__icon",
                "aria-hidden": "true",
              },
              config.value.icon
            ),
          h("span", { class: "ab-status-badge__label" }, config.value.label),
        ].filter(Boolean)
      );
    };
  },
});

// ============================================================================
// VerificationStatus Component
// ============================================================================

export const VerificationStatus = defineComponent({
  name: "AuthboundVerificationStatus",

  props: {
    /** Current status */
    status: {
      type: String as PropType<EudiVerificationStatus>,
      required: true,
    },
    /** Error message (if any) */
    errorMessage: {
      type: String,
      default: null,
    },
    /** Time remaining in seconds */
    timeRemaining: {
      type: Number,
      default: null,
    },
    /** Show description text */
    showDescription: {
      type: Boolean,
      default: true,
    },
    /** Show timer countdown */
    showTimer: {
      type: Boolean,
      default: true,
    },
    /** Layout direction */
    direction: {
      type: String as PropType<"horizontal" | "vertical">,
      default: "vertical",
    },
  },

  setup(props, { slots }) {
    const config = computed(() => STATUS_CONFIG[props.status]);

    const formattedTime = computed(() => {
      if (props.timeRemaining === null) return null;
      const minutes = Math.floor(props.timeRemaining / 60);
      const seconds = props.timeRemaining % 60;
      return `${minutes}:${seconds.toString().padStart(2, "0")}`;
    });

    const description = computed(() => {
      if (
        props.errorMessage &&
        (props.status === "error" || props.status === "failed")
      ) {
        return props.errorMessage;
      }
      return config.value.description;
    });

    return () => {
      const isVertical = props.direction === "vertical";

      const containerStyle: CSSProperties = {
        display: "flex",
        flexDirection: isVertical ? "column" : "row",
        alignItems: isVertical ? "center" : "flex-start",
        gap: "var(--ab-space-3, 0.75rem)",
        textAlign: isVertical ? "center" : "left",
      };

      return h(
        "div",
        {
          class: [
            "ab-verification-status",
            `ab-verification-status--${props.status}`,
            `ab-verification-status--${props.direction}`,
          ].join(" "),
          style: containerStyle,
          role: "status",
          "aria-live": "polite",
        },
        [
          // Icon
          h(
            "div",
            {
              class: "ab-verification-status__icon",
              style: {
                fontSize: "2rem",
                color: config.value.color,
                lineHeight: 1,
              } as CSSProperties,
            },
            slots.icon?.() ?? config.value.icon
          ),

          // Content
          h(
            "div",
            { class: "ab-verification-status__content" },
            [
              // Label
              h(
                "div",
                {
                  class: "ab-verification-status__label",
                  style: {
                    fontSize: "var(--ab-font-size-lg, 1.125rem)",
                    fontWeight: "var(--ab-font-weight-medium, 500)",
                    color: "var(--ab-color-foreground, #1a1a1a)",
                  } as CSSProperties,
                },
                config.value.label
              ),

              // Description
              props.showDescription &&
                h(
                  "div",
                  {
                    class: "ab-verification-status__description",
                    style: {
                      fontSize: "var(--ab-font-size-sm, 0.875rem)",
                      color: "var(--ab-color-muted-foreground, #737373)",
                      marginTop: "var(--ab-space-1, 0.25rem)",
                    } as CSSProperties,
                  },
                  description.value
                ),

              // Timer
              props.showTimer &&
                formattedTime.value &&
                (props.status === "pending" || props.status === "processing") &&
                h(
                  "div",
                  {
                    class: "ab-verification-status__timer",
                    style: {
                      fontSize: "var(--ab-font-size-sm, 0.875rem)",
                      color: "var(--ab-color-muted-foreground, #737373)",
                      marginTop: "var(--ab-space-2, 0.5rem)",
                      fontVariantNumeric: "tabular-nums",
                    } as CSSProperties,
                  },
                  `Expires in ${formattedTime.value}`
                ),
            ].filter(Boolean)
          ),
        ]
      );
    };
  },
});

export type StatusBadgeProps = InstanceType<typeof StatusBadge>["$props"];
export type VerificationStatusProps = InstanceType<
  typeof VerificationStatus
>["$props"];
