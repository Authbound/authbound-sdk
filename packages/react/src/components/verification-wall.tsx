/**
 * VerificationWall - Full-page verification component.
 *
 * Renders a complete verification flow with QR code, status, and error handling.
 */

import type { CSSProperties, ReactNode } from "react";
import type { PolicyId, VerificationResult } from "@authbound/core";
import { AuthboundError } from "@authbound/core";
import { useVerification } from "../hooks/useVerification";
import { QRCodeWithLoading } from "./qr-code";
import { VerificationStatus } from "./verification-status";
import { useAuthbound } from "../context/authbound-context";

// ============================================================================
// Types
// ============================================================================

export interface VerificationWallProps {
  /** Policy to verify against */
  policyId?: PolicyId;
  /** Title text */
  title?: string;
  /** Description text */
  description?: string;
  /** Button text for starting verification */
  buttonText?: string;
  /** Callback when verification succeeds */
  onVerified?: (result: VerificationResult) => void;
  /** Callback when verification fails */
  onFailed?: (error: AuthboundError) => void;
  /** Custom content to show when verified */
  verifiedContent?: ReactNode;
  /** Show deep link button on mobile */
  showDeepLink?: boolean;
  /** Show help text */
  showHelp?: boolean;
  /** Additional className */
  className?: string;
  /** Additional styles */
  style?: CSSProperties;
  /** Children shown instead of default when verified */
  children?: ReactNode;
}

// ============================================================================
// Sub-components
// ============================================================================

function DeepLinkButton({
  href,
  className,
}: {
  href: string;
  className?: string;
}) {
  return (
    <a
      href={href}
      className={`ab-deep-link-button ${className ?? ""}`}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "0.5rem",
        padding: "0.75rem 1.5rem",
        backgroundColor: "var(--ab-color-primary)",
        color: "white",
        borderRadius: "var(--ab-radius-button)",
        textDecoration: "none",
        fontFamily: "var(--ab-font-family)",
        fontWeight: 500,
        fontSize: "var(--ab-font-size-base)",
        transition: "opacity 0.2s",
      }}
    >
      <svg
        width="20"
        height="20"
        viewBox="0 0 20 20"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path
          d="M10 2C5.58 2 2 5.58 2 10C2 14.42 5.58 18 10 18C14.42 18 18 14.42 18 10C18 5.58 14.42 2 10 2ZM10 16C6.69 16 4 13.31 4 10C4 6.69 6.69 4 10 4C13.31 4 16 6.69 16 10C16 13.31 13.31 16 10 16Z"
          fill="currentColor"
        />
        <path
          d="M10.5 6H9V11L13.28 13.54L14 12.33L10.5 10.25V6Z"
          fill="currentColor"
        />
      </svg>
      Open in Wallet
    </a>
  );
}

function StartButton({
  onClick,
  isLoading,
  text,
}: {
  onClick: () => void;
  isLoading: boolean;
  text: string;
}) {
  return (
    <button
      onClick={onClick}
      disabled={isLoading}
      className="ab-start-button"
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        gap: "0.5rem",
        padding: "0.875rem 2rem",
        backgroundColor: "var(--ab-color-primary)",
        color: "white",
        border: "none",
        borderRadius: "var(--ab-radius-button)",
        fontFamily: "var(--ab-font-family)",
        fontWeight: 600,
        fontSize: "var(--ab-font-size-base)",
        cursor: isLoading ? "wait" : "pointer",
        opacity: isLoading ? 0.7 : 1,
        transition: "opacity 0.2s, transform 0.1s",
        minWidth: "200px",
      }}
    >
      {isLoading ? (
        <>
          <span
            className="ab-spinner"
            style={{
              width: 16,
              height: 16,
              border: "2px solid rgba(255,255,255,0.3)",
              borderTopColor: "white",
              borderRadius: "50%",
              animation: "ab-spin 1s linear infinite",
            }}
          />
          Starting...
        </>
      ) : (
        text
      )}
      <style>
        {`
          @keyframes ab-spin {
            to { transform: rotate(360deg); }
          }
          .ab-start-button:hover:not(:disabled) {
            opacity: 0.9;
          }
          .ab-start-button:active:not(:disabled) {
            transform: scale(0.98);
          }
        `}
      </style>
    </button>
  );
}

function RetryButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="ab-retry-button"
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "0.5rem",
        padding: "0.75rem 1.5rem",
        backgroundColor: "transparent",
        color: "var(--ab-color-primary)",
        border: "1px solid var(--ab-color-primary)",
        borderRadius: "var(--ab-radius-button)",
        fontFamily: "var(--ab-font-family)",
        fontWeight: 500,
        fontSize: "var(--ab-font-size-base)",
        cursor: "pointer",
        transition: "background-color 0.2s",
      }}
    >
      <svg
        width="16"
        height="16"
        viewBox="0 0 16 16"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path
          d="M13.65 2.35C12.2 0.9 10.21 0 8 0C3.58 0 0.01 3.58 0.01 8C0.01 12.42 3.58 16 8 16C11.73 16 14.84 13.45 15.73 10H13.65C12.83 12.33 10.61 14 8 14C4.69 14 2 11.31 2 8C2 4.69 4.69 2 8 2C9.66 2 11.14 2.69 12.22 3.78L9 7H16V0L13.65 2.35Z"
          fill="currentColor"
        />
      </svg>
      Try Again
      <style>
        {`
          .ab-retry-button:hover {
            background-color: color-mix(in srgb, var(--ab-color-primary) 10%, transparent);
          }
        `}
      </style>
    </button>
  );
}

// ============================================================================
// Main Component
// ============================================================================

/**
 * Full-page verification flow component.
 *
 * @example
 * ```tsx
 * // Protect a page with verification
 * function ProtectedPage() {
 *   return (
 *     <VerificationWall
 *       policyId="age-gate-18@1.0.0"
 *       title="Age Verification Required"
 *       description="Please verify your age to continue"
 *       onVerified={() => console.log('Verified!')}
 *     >
 *       <ProtectedContent />
 *     </VerificationWall>
 *   );
 * }
 * ```
 */
export function VerificationWall({
  policyId,
  title = "Verification Required",
  description = "Scan the QR code with your EU Digital Identity Wallet to verify your identity.",
  buttonText = "Start Verification",
  onVerified,
  onFailed,
  verifiedContent,
  showDeepLink = true,
  showHelp = true,
  className,
  style,
  children,
}: VerificationWallProps) {
  const { appearance } = useAuthbound();

  const {
    status,
    isLoading,
    isVerified,
    isFailed,
    authorizationRequestUrl,
    deepLink,
    error,
    result,
    timeRemaining,
    startVerification,
    retry,
    reset,
  } = useVerification({
    policyId,
    onVerified,
    onFailed,
  });

  // Show children when verified
  if (isVerified && children) {
    return <>{children}</>;
  }

  return (
    <div
      className={`ab-verification-wall ${className ?? ""}`}
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "100vh",
        padding: "2rem",
        backgroundColor: "var(--ab-color-background)",
        fontFamily: "var(--ab-font-family)",
        color: "var(--ab-color-foreground)",
        ...style,
      }}
    >
      <div
        className="ab-verification-wall__card"
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          maxWidth: "400px",
          width: "100%",
          padding: "var(--ab-card-padding)",
          backgroundColor: "var(--ab-color-background)",
          borderRadius: "var(--ab-radius-card)",
          boxShadow: "var(--ab-card-shadow)",
          border: "1px solid var(--ab-color-border)",
        }}
      >
        {/* Logo */}
        {appearance.layout?.logoImageUrl && (
          <img
            src={appearance.layout.logoImageUrl}
            alt={appearance.layout.logoAlt ?? ""}
            style={{
              maxWidth: "120px",
              marginBottom: "1.5rem",
            }}
          />
        )}

        {/* Title */}
        <h1
          style={{
            margin: 0,
            fontSize: "1.5rem",
            fontWeight: 600,
            textAlign: "center",
          }}
        >
          {title}
        </h1>

        {/* Description */}
        <p
          style={{
            margin: "0.75rem 0 1.5rem",
            fontSize: "var(--ab-font-size-base)",
            color: "var(--ab-color-muted)",
            textAlign: "center",
          }}
        >
          {description}
        </p>

        {/* Idle state - start button */}
        {status === "idle" && (
          <StartButton
            onClick={startVerification}
            isLoading={isLoading}
            text={buttonText}
          />
        )}

        {/* Pending state - QR code */}
        {(status === "pending" || status === "processing") && (
          <>
            <QRCodeWithLoading
              value={authorizationRequestUrl ?? ""}
              isLoading={!authorizationRequestUrl}
              size={256}
            />

            <VerificationStatus
              status={status}
              timeRemaining={timeRemaining}
              showTimer
              style={{ marginTop: "1.5rem", width: "100%" }}
            />

            {/* Deep link for mobile */}
            {showDeepLink && deepLink && (
              <div style={{ marginTop: "1rem" }}>
                <p
                  style={{
                    fontSize: "var(--ab-font-size-small)",
                    color: "var(--ab-color-muted)",
                    textAlign: "center",
                    marginBottom: "0.75rem",
                  }}
                >
                  Or open directly on your phone:
                </p>
                <DeepLinkButton href={deepLink} />
              </div>
            )}
          </>
        )}

        {/* Verified state */}
        {status === "verified" && (
          <>
            {verifiedContent ?? (
              <div style={{ textAlign: "center" }}>
                <div
                  style={{
                    width: 64,
                    height: 64,
                    borderRadius: "50%",
                    backgroundColor: "color-mix(in srgb, var(--ab-color-success) 15%, transparent)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    margin: "0 auto 1rem",
                  }}
                >
                  <svg
                    width="32"
                    height="32"
                    viewBox="0 0 32 32"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                  >
                    <path
                      d="M10 16L14 20L22 12"
                      stroke="var(--ab-color-success)"
                      strokeWidth="3"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </div>
                <VerificationStatus status={status} style={{ marginTop: "1rem" }} />
              </div>
            )}
          </>
        )}

        {/* Failed/Error state */}
        {isFailed && (
          <div style={{ textAlign: "center", width: "100%" }}>
            <VerificationStatus
              status={status}
              error={error}
              style={{ marginBottom: "1.5rem" }}
            />
            <RetryButton onClick={retry} />
          </div>
        )}

        {/* Timeout state */}
        {status === "timeout" && (
          <div style={{ textAlign: "center", width: "100%" }}>
            <VerificationStatus status={status} style={{ marginBottom: "1.5rem" }} />
            <RetryButton onClick={retry} />
          </div>
        )}

        {/* Help link */}
        {showHelp && appearance.layout?.showHelpLink !== false && (
          <a
            href={appearance.layout?.helpLinkUrl ?? "#"}
            style={{
              marginTop: "1.5rem",
              fontSize: "var(--ab-font-size-small)",
              color: "var(--ab-color-muted)",
              textDecoration: "none",
            }}
          >
            Need help?
          </a>
        )}

        {/* Branding */}
        {appearance.layout?.showAuthboundBranding !== false && (
          <div
            style={{
              marginTop: "1.5rem",
              fontSize: "0.75rem",
              color: "var(--ab-color-muted)",
              opacity: 0.7,
            }}
          >
            Powered by{" "}
            <a
              href="https://authbound.io"
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: "inherit" }}
            >
              Authbound
            </a>
          </div>
        )}
      </div>
    </div>
  );
}
