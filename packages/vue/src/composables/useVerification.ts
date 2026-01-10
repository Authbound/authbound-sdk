/**
 * useVerification - Main verification composable.
 *
 * Manages the verification flow state and provides control functions.
 */

import type {
  EudiVerificationStatus,
  PolicyId,
  SessionId,
  VerificationResult,
} from "@authbound/core";
import { AuthboundError, isTerminalStatus } from "@authbound/core";
import {
  type ComputedRef,
  computed,
  onUnmounted,
  type Ref,
  ref,
  watch,
} from "vue";
import { useAuthbound } from "./useAuthbound";

// ============================================================================
// Types
// ============================================================================

export interface UseVerificationOptions {
  /** Policy ID to use (overrides provider default) */
  policyId?: PolicyId;
  /** Auto-start verification on mount */
  autoStart?: boolean;
  /** Customer user reference for linking */
  customerUserRef?: string;
  /** Additional metadata */
  metadata?: Record<string, string>;
  /** Callback when verified */
  onVerified?: (result: VerificationResult) => void;
  /** Callback when failed */
  onFailed?: (error: AuthboundError) => void;
  /** Callback on any status change */
  onStatusChange?: (status: EudiVerificationStatus) => void;
}

export interface UseVerificationReturn {
  // State
  /** Current verification status */
  status: ComputedRef<EudiVerificationStatus>;
  /** Whether verification is in progress */
  isLoading: ComputedRef<boolean>;
  /** Whether verification succeeded */
  isVerified: ComputedRef<boolean>;
  /** Whether verification failed */
  isFailed: ComputedRef<boolean>;
  /** Whether in a terminal state */
  isTerminal: ComputedRef<boolean>;

  // Session data
  /** Current session ID */
  sessionId: ComputedRef<SessionId | null>;
  /** Authorization request URL for QR code */
  authorizationRequestUrl: ComputedRef<string | null>;
  /** Deep link for mobile wallets */
  deepLink: ComputedRef<string | null>;
  /** Current error (if any) */
  error: ComputedRef<AuthboundError | null>;
  /** Verification result (if successful) */
  result: ComputedRef<VerificationResult | null>;
  /** Time remaining until session expires (seconds) */
  timeRemaining: Ref<number | null>;

  // Actions
  /** Start verification */
  startVerification: () => Promise<void>;
  /** Retry verification (creates new session) */
  retry: () => Promise<void>;
  /** Reset to idle state */
  reset: () => void;
}

// ============================================================================
// Composable
// ============================================================================

/**
 * Main verification composable.
 *
 * @example
 * ```vue
 * <script setup>
 * import { useVerification } from '@authbound/vue';
 *
 * const {
 *   status,
 *   isVerified,
 *   authorizationRequestUrl,
 *   startVerification,
 *   retry,
 * } = useVerification({
 *   policyId: 'age-gate-18@1.0.0',
 *   onVerified: (result) => {
 *     router.push('/dashboard');
 *   },
 * });
 * </script>
 *
 * <template>
 *   <button @click="startVerification" v-if="status === 'idle'">
 *     Verify Identity
 *   </button>
 *   <QRCode v-else-if="authorizationRequestUrl" :value="authorizationRequestUrl" />
 *   <p v-if="isVerified">Verified!</p>
 * </template>
 * ```
 */
export function useVerification(
  options: UseVerificationOptions = {}
): UseVerificationReturn {
  const { session, startVerification: ctxStart, resetSession } = useAuthbound();

  // Local state for time tracking
  const timeRemaining = ref<number | null>(null);
  let timerInterval: ReturnType<typeof setInterval> | null = null;

  // Computed state from session
  const status = computed<EudiVerificationStatus>(() => {
    return session.value?.status ?? "idle";
  });

  const isLoading = computed(() => {
    return status.value === "pending" || status.value === "processing";
  });

  const isVerified = computed(() => {
    return status.value === "verified";
  });

  const isFailed = computed(() => {
    return status.value === "failed" || status.value === "error";
  });

  const isTerminal = computed(() => {
    return isTerminalStatus(status.value);
  });

  const sessionId = computed(() => {
    return session.value?.sessionId ?? null;
  });

  const authorizationRequestUrl = computed(() => {
    return session.value?.authorizationRequestUrl ?? null;
  });

  const deepLink = computed(() => {
    return session.value?.deepLink ?? null;
  });

  const error = computed(() => {
    return session.value?.error ?? null;
  });

  const result = computed(() => {
    return session.value?.result ?? null;
  });

  // Timer management
  const startTimer = () => {
    if (timerInterval) {
      clearInterval(timerInterval);
    }

    if (!session.value?.expiresAt) {
      timeRemaining.value = null;
      return;
    }

    const updateTimeRemaining = () => {
      if (!session.value?.expiresAt) {
        timeRemaining.value = null;
        return;
      }

      const remaining = Math.max(
        0,
        Math.floor((session.value.expiresAt.getTime() - Date.now()) / 1000)
      );

      timeRemaining.value = remaining;

      if (remaining <= 0 && timerInterval) {
        clearInterval(timerInterval);
        timerInterval = null;
      }
    };

    updateTimeRemaining();
    timerInterval = setInterval(updateTimeRemaining, 1000);
  };

  const stopTimer = () => {
    if (timerInterval) {
      clearInterval(timerInterval);
      timerInterval = null;
    }
    timeRemaining.value = null;
  };

  // Watch for status changes
  watch(
    status,
    (newStatus, oldStatus) => {
      if (newStatus === oldStatus) return;

      // Call status change callback
      options.onStatusChange?.(newStatus);

      // Handle terminal states
      if (newStatus === "verified" && result.value) {
        options.onVerified?.(result.value);
        stopTimer();
      } else if (
        (newStatus === "failed" || newStatus === "error") &&
        error.value
      ) {
        options.onFailed?.(error.value);
        stopTimer();
      } else if (newStatus === "timeout") {
        options.onFailed?.(
          new AuthboundError("wallet_timeout", "Session timed out")
        );
        stopTimer();
      }
    },
    { immediate: false }
  );

  // Watch session for timer start
  watch(
    () => session.value?.expiresAt,
    (expiresAt) => {
      if (expiresAt && !isTerminal.value) {
        startTimer();
      } else {
        stopTimer();
      }
    },
    { immediate: true }
  );

  // Actions
  const startVerification = async () => {
    await ctxStart({
      policyId: options.policyId,
      customerUserRef: options.customerUserRef,
      metadata: options.metadata,
    });
  };

  const retry = async () => {
    resetSession();
    await startVerification();
  };

  const reset = () => {
    resetSession();
    stopTimer();
  };

  // Auto-start if configured
  if (options.autoStart) {
    startVerification();
  }

  // Cleanup on unmount
  onUnmounted(() => {
    stopTimer();
  });

  return {
    // State
    status,
    isLoading,
    isVerified,
    isFailed,
    isTerminal,

    // Session data
    sessionId,
    authorizationRequestUrl,
    deepLink,
    error,
    result,
    timeRemaining,

    // Actions
    startVerification,
    retry,
    reset,
  };
}
