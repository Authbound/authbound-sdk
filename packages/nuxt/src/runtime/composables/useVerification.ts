/**
 * useVerification - Main verification composable for Nuxt.
 */

import type {
  AuthboundErrorCode,
  ClientToken,
  EudiVerificationStatus,
  PolicyId,
  VerificationId,
  VerificationSuccess,
} from "@authbound-sdk/core";
import {
  AuthboundError,
  asClientToken,
  isTerminalStatus,
} from "@authbound-sdk/core";
import { computed, onUnmounted, ref, watch } from "vue";
import { useRouter } from "nuxt/app";
import { useAuthbound } from "./useAuthbound";

// ============================================================================
// Types
// ============================================================================

export interface UseVerificationOptions {
  /** Policy ID to use (overrides config default) */
  policyId?: PolicyId;
  /** Auto-start verification on mount */
  autoStart?: boolean;
  /** Customer user reference for linking */
  customerUserRef?: string;
  /** Additional metadata */
  metadata?: Record<string, string>;
  /** Optional provider override. The Nuxt server route may restrict this. */
  provider?: "auto" | "vcs" | "eudi";
  /** Redirect on success */
  redirectOnSuccess?: string;
  /** Callback when verified */
  onVerified?: (verification: VerificationSuccess) => void;
  /** Callback when failed */
  onFailed?: (error: AuthboundError) => void;
  /** Callback on any status change */
  onStatusChange?: (status: EudiVerificationStatus) => void;
  /** Callback when timeout or expiration occurs */
  onTimeout?: () => void;
}

// ============================================================================
// Composable
// ============================================================================

/**
 * Main verification composable for Nuxt.
 *
 * @example
 * ```vue
 * <script setup>
 * const {
 *   status,
 *   isVerified,
 *   authorizationRequestUrl,
 *   startVerification,
 *   retry,
 * } = useVerification({
 *   onVerified: () => navigateTo('/dashboard'),
 * });
 * </script>
 *
 * <template>
 *   <button @click="startVerification" v-if="status === 'idle'">
 *     Verify Identity
 *   </button>
 *   <AuthboundQRCode v-else-if="authorizationRequestUrl" :value="authorizationRequestUrl" />
 *   <p v-if="isVerified">Verified!</p>
 * </template>
 * ```
 */
export function useVerification(options: UseVerificationOptions = {}) {
  const { client, config } = useAuthbound();
  const router = useRouter();

  // State
  const status = ref<EudiVerificationStatus>("idle");
  const verificationId = ref<VerificationId | null>(null);
  const authorizationRequestUrl = ref<string | null>(null);
  const deepLink = ref<string | null>(null);
  const clientToken = ref<ClientToken | null>(null);
  const error = ref<AuthboundError | null>(null);
  const timeRemaining = ref<number | null>(null);
  const expiresAt = ref<Date | null>(null);

  // Computed
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

  // Timer
  let timerInterval: ReturnType<typeof setInterval> | null = null;
  let statusCleanup: (() => void) | null = null;

  const startTimer = () => {
    if (timerInterval) clearInterval(timerInterval);

    if (!expiresAt.value) {
      timeRemaining.value = null;
      return;
    }

    const updateTime = () => {
      if (!expiresAt.value) {
        timeRemaining.value = null;
        return;
      }
      const remaining = Math.max(
        0,
        Math.floor((expiresAt.value.getTime() - Date.now()) / 1000)
      );
      timeRemaining.value = remaining;

      if (remaining <= 0 && timerInterval) {
        clearInterval(timerInterval);
        timerInterval = null;
      }
    };

    updateTime();
    timerInterval = setInterval(updateTime, 1000);
  };

  const stopTimer = () => {
    if (timerInterval) {
      clearInterval(timerInterval);
      timerInterval = null;
    }
    timeRemaining.value = null;
  };

  // Watch status changes
  watch(status, (newStatus, oldStatus) => {
    if (newStatus === oldStatus) return;

    options.onStatusChange?.(newStatus);

    if (newStatus === "verified" && verificationId.value) {
      options.onVerified?.({
        verificationId: verificationId.value,
        status: "verified",
      });
      stopTimer();

      // Redirect if configured
      if (options.redirectOnSuccess) {
        router.push(options.redirectOnSuccess);
      }
    } else if (isFailed.value) {
      if (newStatus === "timeout" || newStatus === "expired") {
        options.onTimeout?.();
      }
      options.onFailed?.(
        error.value ??
          new AuthboundError(
            newStatus === "timeout" ? "wallet_timeout" : "verification_invalid_state",
            newStatus === "expired"
              ? "Verification expired."
              : newStatus === "canceled"
                ? "Verification was canceled."
                : "Verification did not complete."
          )
      );
      stopTimer();
    }
  });

  // Start verification
  const startVerification = async () => {
    try {
      status.value = "pending";
      error.value = null;

      statusCleanup?.();
      statusCleanup = null;

      // Create verification via API route
      const response = await $fetch<{
        verificationId: string;
        authorizationRequestUrl: string;
        clientToken: string;
        deepLink?: string;
        expiresAt: string;
      }>("/api/authbound/verification", {
        method: "POST",
        body: {
          policyId: options.policyId ?? config.policyId,
          customerUserRef: options.customerUserRef,
          metadata: options.metadata,
          provider: options.provider,
        },
      });

      verificationId.value = response.verificationId as VerificationId;
      authorizationRequestUrl.value = response.authorizationRequestUrl;
      clientToken.value = asClientToken(response.clientToken);
      deepLink.value = response.deepLink ?? null;
      expiresAt.value = new Date(response.expiresAt);

      startTimer();

      // Subscribe to status updates if client is available
      if (client && verificationId.value && clientToken.value) {
        statusCleanup = client.subscribeToStatus(
          verificationId.value,
          clientToken.value,
          (event) => {
            status.value = event.status;
            if (event.error) {
              error.value = new AuthboundError(
                event.error.code as AuthboundErrorCode,
                event.error.message
              );
            }
          },
          {
            onError: (err) => {
              status.value = "error";
              error.value = err;
            },
          }
        );
      }
    } catch (err) {
      status.value = "error";
      error.value = AuthboundError.from(err);
      throw error.value;
    }
  };

  // Retry
  const retry = async () => {
    reset();
    await startVerification();
  };

  // Reset
  const reset = () => {
    status.value = "idle";
    verificationId.value = null;
    authorizationRequestUrl.value = null;
    clientToken.value = null;
    deepLink.value = null;
    error.value = null;
    expiresAt.value = null;
    statusCleanup?.();
    statusCleanup = null;
    stopTimer();
  };

  // Auto-start
  if (options.autoStart) {
    startVerification();
  }

  // Cleanup
  onUnmounted(() => {
    statusCleanup?.();
    stopTimer();
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
    error,
    timeRemaining,
    // Actions
    startVerification,
    retry,
    reset,
  };
}
