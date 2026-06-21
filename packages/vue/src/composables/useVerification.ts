/**
 * useVerification - Main verification composable.
 *
 * Manages the verification flow state and provides control functions.
 */

import type {
  PolicyId,
  ProviderPreference,
  VerificationId,
  VerificationProviderOptions,
  VerificationSuccess,
  VerificationUiStatus,
  WalletHandoffKind,
} from "@authbound/core";
import { AuthboundError, isTerminalStatus } from "@authbound/core";
import { type ComputedRef, computed, onMounted, watch } from "vue";
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
  metadata?: Record<string, unknown>;
  /** Optional provider override */
  provider?: ProviderPreference;
  /** Provider-specific verification options */
  providerOptions?: VerificationProviderOptions;
  /** Callback when verified */
  onVerified?: (verification: VerificationSuccess) => void;
  /** Callback when failed */
  onFailed?: (error: AuthboundError) => void;
  /** Callback on any status change */
  onStatusChange?: (status: VerificationUiStatus) => void;
  /** Callback when timeout or expiration occurs */
  onTimeout?: () => void;
}

export interface UseVerificationReturn {
  // State
  /** Current verification status */
  status: ComputedRef<VerificationUiStatus>;
  /** Whether verification is in progress */
  isLoading: ComputedRef<boolean>;
  /** Whether verification succeeded */
  isVerified: ComputedRef<boolean>;
  /** Whether verification failed */
  isFailed: ComputedRef<boolean>;
  /** Whether in a terminal state */
  isTerminal: ComputedRef<boolean>;

  // Verification data
  /** Current verification ID */
  verificationId: ComputedRef<VerificationId | null>;
  /** Authorization request URL for QR code */
  authorizationRequestUrl: ComputedRef<string | null>;
  /** Deep link for mobile wallets */
  deepLink: ComputedRef<string | null>;
  /** Wallet handoff payload kind returned by Authbound */
  walletHandoffKind: ComputedRef<WalletHandoffKind | null>;
  /** Current error (if any) */
  error: ComputedRef<AuthboundError | null>;
  /** Time remaining until verification expires (seconds) */
  timeRemaining: ComputedRef<number | null>;

  // Actions
  /** Start verification */
  startVerification: () => Promise<void>;
  /** Retry verification (creates a new verification) */
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
 *   policyId: asPolicyId(import.meta.env.VITE_AUTHBOUND_POLICY_ID),
 *   onVerified: () => {
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
  const {
    verification,
    startVerification: ctxStart,
    resetVerification,
  } = useAuthbound();

  // Computed state from the active verification
  const status = computed<VerificationUiStatus>(
    () => verification.value?.status ?? "idle"
  );

  const isLoading = computed(
    () => status.value === "pending" || status.value === "processing"
  );

  const isVerified = computed(() => status.value === "verified");

  const isFailed = computed(
    () =>
      status.value === "failed" ||
      status.value === "error" ||
      status.value === "canceled" ||
      status.value === "expired" ||
      status.value === "timeout"
  );

  const isTerminal = computed(() => isTerminalStatus(status.value));

  const verificationId = computed(
    () => verification.value?.verificationId ?? null
  );

  const authorizationRequestUrl = computed(
    () => verification.value?.authorizationRequestUrl ?? null
  );

  const deepLink = computed(() => verification.value?.deepLink ?? null);
  const walletHandoffKind = computed(
    () => verification.value?.walletHandoffKind ?? null
  );

  const error = computed(() => verification.value?.error ?? null);
  const timeRemaining = computed(
    () => verification.value?.timeRemaining ?? null
  );

  // Watch for status changes
  watch(
    status,
    (newStatus, oldStatus) => {
      if (newStatus === oldStatus) return;

      // Call status change callback
      options.onStatusChange?.(newStatus);

      // Handle terminal states
      if (newStatus === "verified" && verificationId.value) {
        options.onVerified?.({
          verificationId: verificationId.value,
          status: "verified",
        });
      } else if (isFailed.value) {
        if (newStatus === "timeout" || newStatus === "expired") {
          options.onTimeout?.();
        }
        options.onFailed?.(
          error.value ??
            new AuthboundError(
              newStatus === "timeout"
                ? "wallet_timeout"
                : "verification_invalid_state",
              newStatus === "expired"
                ? "Verification expired."
                : newStatus === "canceled"
                  ? "Verification was canceled."
                  : "Verification did not complete."
            )
        );
      }
    },
    { immediate: false }
  );

  // Actions
  const startVerification = async () => {
    await ctxStart({
      policyId: options.policyId,
      customerUserRef: options.customerUserRef,
      metadata: options.metadata,
      provider: options.provider,
      providerOptions: options.providerOptions,
    });
  };

  const retry = async () => {
    resetVerification();
    await startVerification();
  };

  const reset = () => {
    resetVerification();
  };

  onMounted(() => {
    if (!options.autoStart) {
      return;
    }
    startVerification();
  });

  return {
    // State
    status,
    isLoading,
    isVerified,
    isFailed,
    isTerminal,

    // Verification data
    verificationId,
    authorizationRequestUrl,
    deepLink,
    walletHandoffKind,
    error,
    timeRemaining,

    // Actions
    startVerification,
    retry,
    reset,
  };
}
