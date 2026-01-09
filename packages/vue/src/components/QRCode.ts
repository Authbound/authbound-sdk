/**
 * QRCode Component - Renders verification QR code.
 *
 * Uses the 'qrcode' library to generate real, scannable QR codes.
 */

import {
  defineComponent,
  h,
  ref,
  watch,
  onMounted,
  type PropType,
} from "vue";
import type { CSSProperties } from "vue";
import QRCodeLib from "qrcode";

// ============================================================================
// Component
// ============================================================================

export const QRCode = defineComponent({
  name: "AuthboundQRCode",

  props: {
    /** The data to encode in the QR code */
    value: {
      type: String,
      required: true,
    },
    /** Size in pixels */
    size: {
      type: Number,
      default: 256,
    },
    /** Foreground color */
    fgColor: {
      type: String,
      default: "#000000",
    },
    /** Background color */
    bgColor: {
      type: String,
      default: "#ffffff",
    },
    /** Error correction level */
    level: {
      type: String as PropType<"L" | "M" | "Q" | "H">,
      default: "M",
    },
    /** Include margin */
    includeMargin: {
      type: Boolean,
      default: true,
    },
    /** Custom class */
    class: {
      type: String,
      default: "",
    },
    /** Alt text for accessibility */
    alt: {
      type: String,
      default: "Scan with your EU Digital Identity Wallet",
    },
  },

  setup(props) {
    const dataUrl = ref<string>("");
    const error = ref<Error | null>(null);
    const isLoading = ref(true);

    const generateQRCode = async () => {
      if (!props.value) {
        dataUrl.value = "";
        isLoading.value = false;
        return;
      }

      isLoading.value = true;
      error.value = null;

      try {
        const url = await QRCodeLib.toDataURL(props.value, {
          errorCorrectionLevel: props.level,
          margin: props.includeMargin ? 4 : 0,
          width: props.size,
          color: {
            dark: props.fgColor,
            light: props.bgColor,
          },
        });
        // Validate that the URL is actually an image data URL
        // This prevents potential XSS if the QR library is compromised
        if (!url.startsWith("data:image/")) {
          throw new Error("Invalid QR code data URL: not an image");
        }
        dataUrl.value = url;
      } catch (err) {
        error.value = err as Error;
        console.error("[Authbound] QR code generation failed:", err);
      } finally {
        isLoading.value = false;
      }
    };

    // Generate on mount and when props change
    onMounted(generateQRCode);
    watch(
      () => [props.value, props.size, props.fgColor, props.bgColor, props.level, props.includeMargin],
      generateQRCode
    );

    return () => {
      const containerStyle: CSSProperties = {
        width: `${props.size}px`,
        height: `${props.size}px`,
        display: "inline-block",
      };

      // Error state
      if (error.value) {
        const errorStyle: CSSProperties = {
          ...containerStyle,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "var(--ab-color-background)",
          borderRadius: "var(--ab-radius-card)",
          border: "1px solid var(--ab-color-error, #ef4444)",
          color: "var(--ab-color-error, #ef4444)",
          fontSize: "14px",
          textAlign: "center",
          padding: "16px",
        };

        return h(
          "div",
          {
            class: ["ab-qr-code", "ab-qr-code--error", props.class].filter(Boolean).join(" "),
            style: errorStyle,
            role: "img",
            "aria-label": "QR code generation failed",
          },
          "Failed to generate QR code"
        );
      }

      // Loading state
      if (isLoading.value || !dataUrl.value) {
        const loadingStyle: CSSProperties = {
          ...containerStyle,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "var(--ab-color-background)",
          borderRadius: "var(--ab-radius-card)",
          border: "1px solid var(--ab-color-border)",
        };

        return h(
          "div",
          {
            class: ["ab-qr-code", "ab-qr-code--loading", props.class].filter(Boolean).join(" "),
            style: loadingStyle,
            role: "img",
            "aria-label": "Generating QR code...",
          },
          [
            h("div", {
              class: "ab-spinner",
              style: {
                width: "32px",
                height: "32px",
                border: "3px solid var(--ab-color-border)",
                borderTopColor: "var(--ab-color-primary)",
                borderRadius: "50%",
                animation: "ab-spin 1s linear infinite",
              },
            }),
          ]
        );
      }

      // Success - render QR code image
      return h(
        "div",
        {
          class: ["ab-qr-code", props.class].filter(Boolean).join(" "),
          style: containerStyle,
          "data-testid": "authbound-qrcode",
        },
        [
          h("img", {
            src: dataUrl.value,
            alt: props.alt,
            width: props.size,
            height: props.size,
            style: {
              display: "block",
              width: "100%",
              height: "100%",
            },
          }),
        ]
      );
    };
  },
});

// ============================================================================
// QR Code with Loading State
// ============================================================================

export const QRCodeWithLoading = defineComponent({
  name: "AuthboundQRCodeWithLoading",

  props: {
    /** The data to encode */
    value: {
      type: String as PropType<string | null | undefined>,
      default: null,
    },
    /** Size in pixels */
    size: {
      type: Number,
      default: 256,
    },
    /** Foreground color */
    fgColor: {
      type: String,
      default: "#000000",
    },
    /** Background color */
    bgColor: {
      type: String,
      default: "#ffffff",
    },
    /** Error correction level */
    level: {
      type: String as PropType<"L" | "M" | "Q" | "H">,
      default: "M",
    },
    /** Loading text */
    loadingText: {
      type: String,
      default: "Generating QR code...",
    },
    /** Error text */
    errorText: {
      type: String,
      default: "Failed to generate QR code",
    },
    /** Whether there's an error */
    error: {
      type: Boolean,
      default: false,
    },
    /** Is loading externally */
    isLoading: {
      type: Boolean,
      default: false,
    },
  },

  setup(props, { slots }) {
    return () => {
      const containerStyle: CSSProperties = {
        width: `${props.size}px`,
        height: `${props.size}px`,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "var(--ab-color-muted, #f5f5f5)",
        borderRadius: "var(--ab-radius-lg, 0.75rem)",
      };

      // Error state
      if (props.error) {
        return h(
          "div",
          {
            class: "ab-qr-code ab-qr-code--error",
            style: containerStyle,
          },
          [
            slots.error?.() ??
              h(
                "span",
                {
                  style: {
                    color: "var(--ab-color-error, #b3261e)",
                    fontSize: "var(--ab-font-size-sm, 0.875rem)",
                  },
                },
                props.errorText
              ),
          ]
        );
      }

      // Loading state (external or no value)
      if (props.isLoading || !props.value) {
        return h(
          "div",
          {
            class: "ab-qr-code ab-qr-code--loading",
            style: containerStyle,
          },
          [
            slots.loading?.() ??
              h("div", { class: "ab-spinner" }, [
                h(
                  "span",
                  {
                    style: {
                      color: "var(--ab-color-muted-foreground, #737373)",
                      fontSize: "var(--ab-font-size-sm, 0.875rem)",
                    },
                  },
                  props.loadingText
                ),
              ]),
          ]
        );
      }

      // QR code
      return h(QRCode, {
        value: props.value,
        size: props.size,
        fgColor: props.fgColor,
        bgColor: props.bgColor,
        level: props.level,
      });
    };
  },
});

export type QRCodeProps = InstanceType<typeof QRCode>["$props"];
export type QRCodeWithLoadingProps = InstanceType<typeof QRCodeWithLoading>["$props"];
