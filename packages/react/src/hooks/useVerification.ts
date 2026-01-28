/**
 * useVerification - Main hook for verification flows.
 *
 * Provides a simple, Clerk-style API for starting and monitoring verification.
 */

import type {
  EudiVerificationStatus,
  PolicyId,
  SessionId,
  VerificationResult,
} from "@authbound-sdk/core";
import { AuthboundError } from "@authbound-sdk/core";
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
  /** Current session ID */
  sessionId: SessionId | null;
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

/**
 * Hook for managing verification flows.
 *
 * @example
 * ```tsx
 * function VerifyPage() {
 *   const {
 *     status,
 *     authorizationRequestUrl,
 *     startVerification,
 *     isVerified,
 *     error,
 *   } = useVerification({
 *     policyId: 'age-gate-18@1.0.0',
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
    onVerified,
    onFailed,
    onStatusChange,
    onTimeout,
  } = options;

  const {
    client,
    session,
    policyId: contextPolicyId,
    startVerification: contextStart,
    resetSession,
  } = useAuthbound();

  const policyId = optionsPolicyId ?? contextPolicyId;

  // Track previous status for change detection
  const prevStatusRef = useRef<EudiVerificationStatus>("idle");

  // Local loading state for start operation
  const [isStarting, setIsStarting] = useState(false);

  // Timer for countdown
  const [timeRemaining, setTimeRemaining] = useState<number | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Derive state from session
  const status = session?.status ?? "idle";
  const isLoading =
    isStarting || status === "pending" || status === "processing";
  const isVerified = status === "verified";
  const isFailed = status === "failed" || status === "error";
  const sessionId = session?.sessionId ?? null;
  const authorizationRequestUrl = session?.authorizationRequestUrl ?? null;
  const deepLink =
    session?.deepLink ??
    (authorizationRequestUrl ? client.getDeepLink(authorizationRequestUrl) : null);
  const error = session?.error ?? null;
  const result = session?.result ?? null;

  // Start verification
  const startVerification = useCallback(async () => {
    if (isStarting) return;

    setIsStarting(true);

    try {
      await contextStart({
        policyId,
        customerUserRef,
        metadata,
      });
    } catch (err) {
      // Error is already set in session
      const authboundError = AuthboundError.from(err);
      onFailed?.(authboundError);
    } finally {
      setIsStarting(false);
    }
  }, [contextStart, policyId, customerUserRef, metadata, onFailed, isStarting]);

  // Retry after failure
  const retry = useCallback(async () => {
    resetSession();
    await startVerification();
  }, [resetSession, startVerification]);

  // Reset to initial state
  const reset = useCallback(() => {
    resetSession();
    setTimeRemaining(null);
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, [resetSession]);

  // Handle status changes
  useEffect(() => {
    if (status !== prevStatusRef.current) {
      prevStatusRef.current = status;
      onStatusChange?.(status);

      // Handle terminal states
      if (status === "verified" && result) {
        onVerified?.(result);
      } else if (status === "failed" && error) {
        onFailed?.(error);
      } else if (status === "timeout") {
        onTimeout?.();
      }
    }
  }, [status, result, error, onVerified, onFailed, onStatusChange, onTimeout]);

  // Countdown timer
  useEffect(() => {
    // Always clear any existing interval first to prevent race conditions
    // where multiple intervals could stack up during rapid session changes
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }

    if (session?.expiresAt && status === "pending") {
      const updateTimer = () => {
        const remaining = Math.max(
          0,
          Math.floor((session.expiresAt.getTime() - Date.now()) / 1000)
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
  }, [session?.expiresAt, status]);

  // Auto-start on mount
  useEffect(() => {
    if (autoStart && status === "idle") {
      startVerification();
    }
  }, [autoStart, status, startVerification]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, []);

  return {
    status,
    isLoading,
    isVerified,
    isFailed,
    sessionId,
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
