/**
 * useVerification - Main verification composable for Nuxt.
 */

import type {
  AuthboundErrorCode,
  EudiVerificationStatus,
  PolicyId,
  SessionId,
  VerificationResult,
} from "@authbound-sdk/core";
import { AuthboundError, isTerminalStatus } from "@authbound-sdk/core";
import { computed, onUnmounted, ref, watch } from "vue";
import { useRouter, useRuntimeConfig } from "#app";
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
  /** Redirect on success */
  redirectOnSuccess?: string;
  /** Callback when verified */
  onVerified?: (result: VerificationResult) => void;
  /** Callback when failed */
  onFailed?: (error: AuthboundError) => void;
  /** Callback on any status change */
  onStatusChange?: (status: EudiVerificationStatus) => void;
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
  const runtimeConfig = useRuntimeConfig();

  // State
  const status = ref<EudiVerificationStatus>("idle");
  const sessionId = ref<SessionId | null>(null);
  const authorizationRequestUrl = ref<string | null>(null);
  const deepLink = ref<string | null>(null);
  const clientToken = ref<string | null>(null);
  const error = ref<AuthboundError | null>(null);
  const result = ref<VerificationResult | null>(null);
  const timeRemaining = ref<number | null>(null);
  const expiresAt = ref<Date | null>(null);

  // Computed
  const isLoading = computed(
    () => status.value === "pending" || status.value === "processing"
  );
  const isVerified = computed(() => status.value === "verified");
  const isFailed = computed(
    () => status.value === "failed" || status.value === "error"
  );
  const isTerminal = computed(() => isTerminalStatus(status.value));

  // Timer
  let timerInterval: ReturnType<typeof setInterval> | null = null;

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

    if (newStatus === "verified" && result.value) {
      options.onVerified?.(result.value);
      stopTimer();

      // Redirect if configured
      if (options.redirectOnSuccess) {
        router.push(options.redirectOnSuccess);
      }
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
  });

  // Start verification
  const startVerification = async () => {
    try {
      status.value = "pending";
      error.value = null;

      // Create session via API route
      const response = await $fetch<{
        sessionId: string;
        authorizationRequestUrl: string;
        clientToken: string;
        deepLink?: string;
        expiresAt: string;
      }>("/api/authbound/session", {
        method: "POST",
        body: {
          policyId: options.policyId ?? config.policyId,
          customerUserRef: options.customerUserRef,
          metadata: options.metadata,
        },
      });

      sessionId.value = response.sessionId as SessionId;
      authorizationRequestUrl.value = response.authorizationRequestUrl;
      clientToken.value = response.clientToken;
      deepLink.value = response.deepLink ?? null;
      expiresAt.value = new Date(response.expiresAt);

      startTimer();

      // Subscribe to status updates if client is available
      if (client && sessionId.value && clientToken.value) {
        client.subscribeToStatus(
          sessionId.value,
          clientToken.value as any,
          (event) => {
            status.value = event.status;
            if (event.result) {
              result.value = event.result;
            }
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
    sessionId.value = null;
    authorizationRequestUrl.value = null;
    clientToken.value = null;
    deepLink.value = null;
    error.value = null;
    result.value = null;
    expiresAt.value = null;
    stopTimer();
  };

  // Auto-start
  if (options.autoStart) {
    startVerification();
  }

  // Cleanup
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
