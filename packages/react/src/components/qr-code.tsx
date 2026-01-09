/**
 * QR Code component for displaying verification URLs.
 *
 * Uses the 'qrcode' library for proper, scannable QR code generation.
 */

import { useEffect, useState, type CSSProperties } from "react";
import QRCodeLib from "qrcode";
import { useAuthbound } from "../context/authbound-context";

// ============================================================================
// Types
// ============================================================================

export interface QRCodeProps {
  /** The value to encode (authorization request URL) */
  value: string;
  /** Size in pixels (default: 256) */
  size?: number;
  /** Foreground color (default: from theme) */
  fgColor?: string;
  /** Background color (default: from theme) */
  bgColor?: string;
  /** Error correction level (default: M) */
  level?: "L" | "M" | "Q" | "H";
  /** Include quiet zone margin (default: true) */
  includeMargin?: boolean;
  /** Additional className */
  className?: string;
  /** Additional styles */
  style?: CSSProperties;
  /** Alt text for accessibility */
  alt?: string;
}

// ============================================================================
// Component
// ============================================================================

/**
 * QR Code display component.
 *
 * Generates a scannable QR code using the 'qrcode' library.
 *
 * @example
 * ```tsx
 * <QRCode
 *   value={authorizationRequestUrl}
 *   size={256}
 *   level="M"
 * />
 * ```
 */
export function QRCode({
  value,
  size = 256,
  fgColor,
  bgColor,
  level = "M",
  includeMargin = true,
  className,
  style,
  alt = "Scan with your EU Digital Identity Wallet",
}: QRCodeProps) {
  const { appearance } = useAuthbound();
  const [dataUrl, setDataUrl] = useState<string>("");
  const [error, setError] = useState<Error | null>(null);

  // Resolve colors
  const fg = fgColor ?? "#1a1a1a";
  const bg = bgColor ?? "#ffffff";

  // Generate QR code as data URL
  useEffect(() => {
    if (!value) {
      setDataUrl("");
      return;
    }

    let mounted = true;

    QRCodeLib.toDataURL(value, {
      errorCorrectionLevel: level,
      margin: includeMargin ? 4 : 0,
      width: size,
      color: {
        dark: fg,
        light: bg,
      },
    })
      .then((url) => {
        if (mounted) {
          // Validate that the URL is actually an image data URL
          // This prevents potential XSS if the QR library is compromised
          if (!url.startsWith("data:image/")) {
            throw new Error("Invalid QR code data URL: not an image");
          }
          setDataUrl(url);
          setError(null);
        }
      })
      .catch((err) => {
        if (mounted) {
          setError(err);
          console.error("[Authbound] QR code generation failed:", err);
        }
      });

    return () => {
      mounted = false;
    };
  }, [value, size, fg, bg, level, includeMargin]);

  if (error) {
    return (
      <div
        className={`ab-qr-code ab-qr-code--error ${className ?? ""}`}
        style={{
          width: size,
          height: size,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "var(--ab-color-background)",
          borderRadius: "var(--ab-radius-card)",
          border: "1px solid var(--ab-color-error, #ef4444)",
          color: "var(--ab-color-error, #ef4444)",
          fontSize: 14,
          textAlign: "center",
          padding: 16,
          ...style,
        }}
        role="img"
        aria-label="QR code generation failed"
      >
        Failed to generate QR code
      </div>
    );
  }

  if (!dataUrl) {
    return (
      <div
        className={`ab-qr-code ab-qr-code--loading ${className ?? ""}`}
        style={{
          width: size,
          height: size,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "var(--ab-color-background)",
          borderRadius: "var(--ab-radius-card)",
          border: "1px solid var(--ab-color-border)",
          ...style,
        }}
        role="img"
        aria-label="Generating QR code..."
      >
        <div
          className="ab-spinner"
          style={{
            width: 32,
            height: 32,
            border: "3px solid var(--ab-color-border)",
            borderTopColor: "var(--ab-color-primary)",
            borderRadius: "50%",
            animation: "ab-spin 1s linear infinite",
          }}
        />
        <style>
          {`
            @keyframes ab-spin {
              to { transform: rotate(360deg); }
            }
          `}
        </style>
      </div>
    );
  }

  return (
    <div
      className={`ab-qr-code ${className ?? ""}`}
      style={{
        width: size,
        height: size,
        ...style,
      }}
    >
      <img
        src={dataUrl}
        alt={alt}
        width={size}
        height={size}
        style={{
          display: "block",
          width: "100%",
          height: "100%",
        }}
      />
    </div>
  );
}

/**
 * QR Code with loading state.
 */
export function QRCodeWithLoading({
  value,
  isLoading = false,
  ...props
}: QRCodeProps & { isLoading?: boolean }) {
  if (isLoading || !value) {
    return (
      <div
        className="ab-qr-code ab-qr-code--loading"
        style={{
          width: props.size ?? 256,
          height: props.size ?? 256,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "var(--ab-color-background)",
          borderRadius: "var(--ab-radius-card)",
          border: "1px solid var(--ab-color-border)",
        }}
      >
        <div
          className="ab-spinner"
          style={{
            width: 32,
            height: 32,
            border: "3px solid var(--ab-color-border)",
            borderTopColor: "var(--ab-color-primary)",
            borderRadius: "50%",
            animation: "ab-spin 1s linear infinite",
          }}
        />
        <style>
          {`
            @keyframes ab-spin {
              to { transform: rotate(360deg); }
            }
          `}
        </style>
      </div>
    );
  }

  return <QRCode value={value} {...props} />;
}
