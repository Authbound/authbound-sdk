/**
 * useVerification - Main hook for verification flows.
 *
 * Provides a simple, Clerk-style API for starting and monitoring verification.
 */

import type {
  EudiVerificationStatus,
  PolicyId,
  VerificationId,
  VerificationResult,
} from "@authbound/core";
import { AuthboundError } from "@authbound/core";
import { useCallback, useEffect, useRef, useState } from "react";
import { useAuthbound } from "../context/authbound-context";

// ============================================================================
// Types
// ============================================================================

export interface UseVerificationOptions {
  /** Policy to verify against */
  policyId?: PolicyId;
  /** Auto-start verification on mount */
  autoStart?: boolean;
  /** Reference ID for your user (for webhooks) */
  customerUserRef?: string;
  /** Additional metadata */
  metadata?: Record<string, string>;
  /** Optional provider override */
  provider?: "auto" | "vcs" | "eudi";
  /** Callback when verification succeeds */
  onVerified?: (result: VerificationResult) => void;
  /** Callback when verification fails */
  onFailed?: (error: AuthboundError) => void;
  /** Callback when status changes */
  onStatusChange?: (status: EudiVerificationStatus) => void;
  /** Callback when timeout occurs */
  onTimeout?: () => void;
}

export interface UseVerificationReturn {
  /** Current verification status */
  status: EudiVerificationStatus;
  /** Whether verification is in progress */
  isLoading: boolean;
  /** Whether verification completed successfully */
  isVerified: boolean;
  /** Whether verification failed */
  isFailed: boolean;
  /** Current verification ID */
  verificationId: VerificationId | null;
  /** Authorization request URL for QR code */
  authorizationRequestUrl: string | null;
  /** Deep link for mobile */
  deepLink: string | null;
  /** Error if verification failed */
  error: AuthboundError | null;
  /** Verification result if successful */
  result: VerificationResult | null;
  /** Seconds remaining until timeout */
  timeRemaining: number | null;
  /** Start verification flow */
  startVerification: () => Promise<void>;
  /** Retry after failure */
  retry: () => Promise<void>;
  /** Reset to initial state */
  reset: () => void;
}

// ============================================================================
// Hook
// ============================================================================

export function isVerificationFailureStatus(
  status: EudiVerificationStatus
): boolean {
  return (
    status === "failed" ||
    status === "error" ||
    status === "canceled" ||
    status === "expired" ||
    status === "timeout"
  );
}

function errorForTerminalStatus(
  status: EudiVerificationStatus,
  error: AuthboundError | null
): AuthboundError {
  if (error) return error;
  if (status === "expired") {
    return new AuthboundError("verification_expired", "Verification expired.");
  }
  if (status === "timeout") {
    return new AuthboundError("wallet_timeout", "Verification timed out.");
  }
  if (status === "canceled") {
    return new AuthboundError(
      "verification_invalid_state",
      "Verification was canceled."
    );
  }
  return new AuthboundError(
    "verification_invalid_state",
    "Verification did not complete."
  );
}

/**
 * Hook for managing verification flows.
 *
 * @example
 * ```tsx
 * function VerifyPage() {
 *   const policyId = asPolicyId(process.env.NEXT_PUBLIC_AUTHBOUND_POLICY_ID!);
 *   const {
 *     status,
 *     authorizationRequestUrl,
 *     startVerification,
 *     isVerified,
 *     error,
 *   } = useVerification({
 *     policyId,
 *     onVerified: () => router.push('/dashboard'),
 *   });
 *
 *   return (
 *     <div>
 *       {status === 'idle' && (
 *         <button onClick={startVerification}>Start Verification</button>
 *       )}
 *       {status === 'pending' && authorizationRequestUrl && (
 *         <QRCode value={authorizationRequestUrl} />
 *       )}
 *       {isVerified && <p>Verified!</p>}
 *       {error && <p>Error: {error.message}</p>}
 *     </div>
 *   );
 * }
 * ```
 */
export function useVerification(
  options: UseVerificationOptions = {}
): UseVerificationReturn {
  const {
    policyId: optionsPolicyId,
    autoStart = false,
    customerUserRef,
    metadata,
    provider,
    onVerified,
    onFailed,
    onStatusChange,
    onTimeout,
  } = options;

  const {
    client,
    verification,
    policyId: contextPolicyId,
    startVerification: contextStart,
    resetVerification,
  } = useAuthbound();

  const policyId = optionsPolicyId ?? contextPolicyId;

  // Track previous status for change detection
  const prevStatusRef = useRef<EudiVerificationStatus>("idle");
  const verifiedResultRef = useRef<VerificationResult | null>(null);

  // Local loading state for start operation
  const [isStarting, setIsStarting] = useState(false);

  // Timer for countdown
  const [timeRemaining, setTimeRemaining] = useState<number | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Derive state from the current verification
  const status = verification?.status ?? "idle";
  const isLoading =
    isStarting || status === "pending" || status === "processing";
  const isVerified = status === "verified";
  const isFailed = isVerificationFailureStatus(status);
  const verificationId = verification?.verificationId ?? null;
  const authorizationRequestUrl = verification?.authorizationRequestUrl ?? null;
  let deepLink: string | null = null;
  try {
    deepLink =
      verification?.deepLink ??
      (authorizationRequestUrl
        ? client.getDeepLink(authorizationRequestUrl)
        : null);
  } catch (err) {
    client.log("Failed to generate deep link:", err);
  }
  const error = verification?.error ?? null;
  const result = verification?.result ?? null;

  // Start verification
  const startVerification = useCallback(async () => {
    if (isStarting) return;

    setIsStarting(true);

    try {
      await contextStart({
        policyId,
        customerUserRef,
        metadata,
        provider,
      });
    } catch (err) {
      // Error is already reflected in verification state
      const authboundError = AuthboundError.from(err);
      onFailed?.(authboundError);
    } finally {
      setIsStarting(false);
    }
  }, [
    contextStart,
    policyId,
    customerUserRef,
    metadata,
    provider,
    onFailed,
    isStarting,
  ]);

  // Retry after failure
  const retry = useCallback(async () => {
    resetVerification();
    await startVerification();
  }, [resetVerification, startVerification]);

  // Reset to initial state
  const reset = useCallback(() => {
    resetVerification();
    setTimeRemaining(null);
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, [resetVerification]);

  // Handle status changes
  useEffect(() => {
    if (status !== prevStatusRef.current) {
      prevStatusRef.current = status;
      onStatusChange?.(status);

      if (status === "timeout" || status === "expired") {
        onTimeout?.();
      }
      if (isVerificationFailureStatus(status)) {
        onFailed?.(errorForTerminalStatus(status, error));
      }
    }
  }, [status, error, onFailed, onStatusChange, onTimeout]);

  useEffect(() => {
    if (status !== "verified") {
      verifiedResultRef.current = null;
      return;
    }
    if (result && verifiedResultRef.current !== result) {
      verifiedResultRef.current = result;
      onVerified?.(result);
    }
  }, [status, result, onVerified]);

  // Countdown timer
  useEffect(() => {
    // Always clear any existing interval first to prevent race conditions
    // where multiple intervals could stack up during rapid verification changes
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }

    if (verification?.expiresAt && status === "pending") {
      const updateTimer = () => {
        const remaining = Math.max(
          0,
          Math.floor((verification.expiresAt.getTime() - Date.now()) / 1000)
        );
        setTimeRemaining(remaining);

        if (remaining <= 0 && timerRef.current) {
          clearInterval(timerRef.current);
          timerRef.current = null;
        }
      };

      updateTimer();
      timerRef.current = setInterval(updateTimer, 1000);

      return () => {
        if (timerRef.current) {
          clearInterval(timerRef.current);
          timerRef.current = null;
        }
      };
    }
    setTimeRemaining(null);
  }, [verification?.expiresAt, status]);

  // Auto-start on mount
  useEffect(() => {
    if (autoStart && status === "idle") {
      startVerification();
    }
  }, [autoStart, status, startVerification]);

  // Cleanup on unmount
  useEffect(
    () => () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    },
    []
  );

  return {
    status,
    isLoading,
    isVerified,
    isFailed,
    verificationId,
    authorizationRequestUrl,
    deepLink: deepLink || null,
    error,
    result,
    timeRemaining,
    startVerification,
    retry,
    reset,
  };
}
