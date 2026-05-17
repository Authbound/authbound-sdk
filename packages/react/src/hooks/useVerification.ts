/**
 * useVerification - Main hook for verification flows.
 *
 * Provides a simple, Clerk-style API for starting and monitoring verification.
 */

import type {
  PolicyId,
  ProviderPreference,
  VerificationId,
  VerificationSuccess,
  VerificationUiStatus,
  WalletHandoffKind,
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
  provider?: ProviderPreference;
  /** Callback when verification succeeds */
  onVerified?: (verification: VerificationSuccess) => void;
  /** Callback when verification fails */
  onFailed?: (error: AuthboundError) => void;
  /** Callback when status changes */
  onStatusChange?: (status: VerificationUiStatus) => void;
  /** Callback when timeout occurs */
  onTimeout?: () => void;
}

export interface UseVerificationReturn {
  /** Current verification status */
  status: VerificationUiStatus;
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
  /** Wallet handoff payload kind returned by Authbound */
  walletHandoffKind: WalletHandoffKind | null;
  /** Error if verification failed */
  error: AuthboundError | null;
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
  status: VerificationUiStatus
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
  status: VerificationUiStatus,
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
    verification,
    policyId: contextPolicyId,
    startVerification: contextStart,
    resetVerification,
  } = useAuthbound();

  const policyId = optionsPolicyId ?? contextPolicyId;

  // Track previous status for change detection
  const prevStatusRef = useRef<VerificationUiStatus>("idle");
  const verifiedCallbackIdRef = useRef<VerificationId | null>(null);

  // Local loading state for start operation
  const [isStarting, setIsStarting] = useState(false);

  // Derive state from the current verification
  const status = verification?.status ?? "idle";
  const isLoading =
    isStarting || status === "pending" || status === "processing";
  const isVerified = status === "verified";
  const isFailed = isVerificationFailureStatus(status);
  const verificationId = verification?.verificationId ?? null;
  const authorizationRequestUrl = verification?.authorizationRequestUrl ?? null;
  const deepLink = verification?.deepLink ?? null;
  const walletHandoffKind = verification?.walletHandoffKind ?? null;
  const error = verification?.error ?? null;
  const timeRemaining = verification?.timeRemaining ?? null;

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
    if (status !== "verified" || !verificationId) {
      if (status === "idle") {
        verifiedCallbackIdRef.current = null;
      }
      return;
    }
    if (verifiedCallbackIdRef.current !== verificationId) {
      verifiedCallbackIdRef.current = verificationId;
      onVerified?.({ verificationId, status: "verified" });
    }
  }, [status, verificationId, onVerified]);

  // Auto-start on mount
  useEffect(() => {
    if (autoStart && status === "idle") {
      startVerification();
    }
  }, [autoStart, status, startVerification]);

  return {
    status,
    isLoading,
    isVerified,
    isFailed,
    verificationId,
    authorizationRequestUrl,
    deepLink: deepLink || null,
    walletHandoffKind,
    error,
    timeRemaining,
    startVerification,
    retry,
    reset,
  };
}
