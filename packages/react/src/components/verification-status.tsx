/**
 * Verification status display components.
 */

import type { AuthboundError, EudiVerificationStatus } from "@authbound-sdk/core";
import type { CSSProperties, ReactNode } from "react";

// ============================================================================
// Types
// ============================================================================

export interface VerificationStatusProps {
  /** Current verification status */
  status: EudiVerificationStatus;
  /** Error if verification failed */
  error?: AuthboundError | null;
  /** Time remaining in seconds */
  timeRemaining?: number | null;
  /** Show timer when pending */
  showTimer?: boolean;
  /** Custom messages for each status */
  messages?: Partial<Record<EudiVerificationStatus, string>>;
  /** Additional className */
  className?: string;
  /** Additional styles */
  style?: CSSProperties;
}

// ============================================================================
// Default Messages
// ============================================================================

const DEFAULT_MESSAGES: Record<EudiVerificationStatus, string> = {
  idle: "Ready to verify",
  pending: "Waiting for wallet...",
  processing: "Verifying credentials...",
  verified: "Verification successful",
  failed: "Verification failed",
  timeout: "Verification timed out",
  error: "An error occurred",
};

// ============================================================================
// Status Icons
// ============================================================================

function IdleIcon() {
  return (
    <svg
      fill="none"
      height="20"
      viewBox="0 0 20 20"
      width="20"
      xmlns="http://www.w3.org/2000/svg"
    >
      <circle
        cx="10"
        cy="10"
        opacity="0.5"
        r="8"
        stroke="currentColor"
        strokeWidth="2"
      />
    </svg>
  );
}

function PendingIcon() {
  return (
    <svg
      className="ab-status-icon--spinning"
      fill="none"
      height="20"
      viewBox="0 0 20 20"
      width="20"
      xmlns="http://www.w3.org/2000/svg"
    >
      <circle
        cx="10"
        cy="10"
        r="8"
        stroke="currentColor"
        strokeDasharray="25 25"
        strokeLinecap="round"
        strokeWidth="2"
      />
      <style>
        {`
          .ab-status-icon--spinning {
            animation: ab-spin 1s linear infinite;
          }
          @keyframes ab-spin {
            to { transform: rotate(360deg); }
          }
        `}
      </style>
    </svg>
  );
}

function VerifiedIcon() {
  return (
    <svg
      fill="none"
      height="20"
      viewBox="0 0 20 20"
      width="20"
      xmlns="http://www.w3.org/2000/svg"
    >
      <circle cx="10" cy="10" fill="var(--ab-color-success)" r="9" />
      <path
        d="M6 10L9 13L14 7"
        stroke="white"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
      />
    </svg>
  );
}

function FailedIcon() {
  return (
    <svg
      fill="none"
      height="20"
      viewBox="0 0 20 20"
      width="20"
      xmlns="http://www.w3.org/2000/svg"
    >
      <circle cx="10" cy="10" fill="var(--ab-color-error)" r="9" />
      <path
        d="M7 7L13 13M13 7L7 13"
        stroke="white"
        strokeLinecap="round"
        strokeWidth="2"
      />
    </svg>
  );
}

function TimeoutIcon() {
  return (
    <svg
      fill="none"
      height="20"
      viewBox="0 0 20 20"
      width="20"
      xmlns="http://www.w3.org/2000/svg"
    >
      <circle
        cx="10"
        cy="10"
        r="8"
        stroke="var(--ab-color-warning)"
        strokeWidth="2"
      />
      <path
        d="M10 6V10L12 12"
        stroke="var(--ab-color-warning)"
        strokeLinecap="round"
        strokeWidth="2"
      />
    </svg>
  );
}

function getStatusIcon(status: EudiVerificationStatus): ReactNode {
  switch (status) {
    case "idle":
      return <IdleIcon />;
    case "pending":
    case "processing":
      return <PendingIcon />;
    case "verified":
      return <VerifiedIcon />;
    case "failed":
    case "error":
      return <FailedIcon />;
    case "timeout":
      return <TimeoutIcon />;
    default:
      return <IdleIcon />;
  }
}

// ============================================================================
// Status Colors
// ============================================================================

function getStatusColor(status: EudiVerificationStatus): string {
  switch (status) {
    case "verified":
      return "var(--ab-color-success)";
    case "failed":
    case "error":
      return "var(--ab-color-error)";
    case "timeout":
      return "var(--ab-color-warning)";
    default:
      return "var(--ab-color-foreground)";
  }
}

// ============================================================================
// Component
// ============================================================================

/**
 * Display verification status with icon and message.
 *
 * @example
 * ```tsx
 * const { status, error, timeRemaining } = useVerification();
 *
 * return (
 *   <VerificationStatus
 *     status={status}
 *     error={error}
 *     timeRemaining={timeRemaining}
 *     showTimer
 *   />
 * );
 * ```
 */
export function VerificationStatus({
  status,
  error,
  timeRemaining,
  showTimer = true,
  messages,
  className,
  style,
}: VerificationStatusProps) {
  const message = messages?.[status] ?? DEFAULT_MESSAGES[status];
  const color = getStatusColor(status);

  // Format time remaining
  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  return (
    <div
      aria-live="polite"
      className={`ab-status ${className ?? ""}`}
      role="status"
      style={{
        display: "flex",
        alignItems: "center",
        gap: "0.5rem",
        padding: "0.75rem 1rem",
        borderRadius: "var(--ab-radius-button)",
        backgroundColor:
          status === "verified"
            ? "color-mix(in srgb, var(--ab-color-success) 10%, transparent)"
            : status === "failed" || status === "error"
              ? "color-mix(in srgb, var(--ab-color-error) 10%, transparent)"
              : "var(--ab-color-background)",
        border: `1px solid ${color}`,
        color,
        fontFamily: "var(--ab-font-family)",
        fontSize: "var(--ab-font-size-base)",
        ...style,
      }}
    >
      <span className="ab-status__icon">{getStatusIcon(status)}</span>

      <span className="ab-status__message" style={{ flex: 1 }}>
        {message}
        {error && status !== "timeout" && (
          <span
            style={{
              display: "block",
              fontSize: "var(--ab-font-size-small)",
              opacity: 0.8,
              marginTop: "0.25rem",
            }}
          >
            {error.message}
          </span>
        )}
      </span>

      {showTimer && status === "pending" && timeRemaining != null && (
        <span
          className="ab-status__timer"
          style={{
            fontFamily: "monospace",
            fontSize: "var(--ab-font-size-small)",
            opacity: 0.7,
          }}
        >
          {formatTime(timeRemaining)}
        </span>
      )}
    </div>
  );
}

// ============================================================================
// Simple Status Badge
// ============================================================================

export interface StatusBadgeProps {
  status: EudiVerificationStatus;
  size?: "sm" | "md" | "lg";
  className?: string;
  style?: CSSProperties;
}

/**
 * Compact status badge.
 */
export function StatusBadge({
  status,
  size = "md",
  className,
  style,
}: StatusBadgeProps) {
  const color = getStatusColor(status);
  const sizes = {
    sm: { padding: "0.25rem 0.5rem", fontSize: "0.75rem" },
    md: { padding: "0.375rem 0.75rem", fontSize: "0.875rem" },
    lg: { padding: "0.5rem 1rem", fontSize: "1rem" },
  };

  return (
    <span
      className={`ab-status-badge ab-status-badge--${status} ${className ?? ""}`}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "0.375rem",
        borderRadius: "9999px",
        backgroundColor: `color-mix(in srgb, ${color} 15%, transparent)`,
        color,
        fontFamily: "var(--ab-font-family)",
        fontWeight: 500,
        textTransform: "capitalize",
        ...sizes[size],
        ...style,
      }}
    >
      <span
        style={{
          width: "0.5em",
          height: "0.5em",
          borderRadius: "50%",
          backgroundColor: "currentColor",
        }}
      />
      {status}
    </span>
  );
}
