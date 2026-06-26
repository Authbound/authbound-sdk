/**
 * useVerification - Main verification composable for Nuxt.
 */

import type {
  ClientToken,
  PolicyId,
  ProviderPreference,
  VerificationId,
  VerificationSuccess,
  VerificationUiStatus,
} from "@authbound/core";
import {
  AuthboundError,
  type BrowserVerificationFlowClient,
  type BrowserVerificationFlowState,
  createBrowserVerificationFlow,
  isTerminalStatus,
} from "@authbound/core";
import { useRouter } from "nuxt/app";
import { computed, onUnmounted, ref, watch } from "vue";
import { useAuthbound } from "./useAuthbound";

// ============================================================================
// Types
// ============================================================================

export interface UseVerificationOptions {
  /** Policy ID to use (overrides config default) */
  policyId?: PolicyId | string;
  /** Auto-start verification on mount */
  autoStart?: boolean;
  /** Customer user reference for linking */
  customerUserRef?: string;
  /** Additional metadata */
  metadata?: Record<string, unknown>;
  /** Optional provider override. The Nuxt server route may restrict this. */
  provider?: ProviderPreference;
  /** Redirect on success */
  redirectOnSuccess?: string;
  /** Callback when verified */
  onVerified?: (verification: VerificationSuccess) => void;
  /** Callback when failed */
  onFailed?: (error: AuthboundError) => void;
  /** Callback on any status change */
  onStatusChange?: (status: VerificationUiStatus) => void;
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
  const status = ref<VerificationUiStatus>("idle");
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

  const applyFlowState = (flowState: BrowserVerificationFlowState) => {
    status.value = flowState.status;
    verificationId.value = flowState.verificationId ?? null;
    authorizationRequestUrl.value = flowState.authorizationRequestUrl ?? null;
    clientToken.value = flowState.clientToken ?? null;
    deepLink.value = flowState.deepLink ?? null;
    error.value = flowState.error ?? null;
    expiresAt.value = flowState.expiresAt ?? null;
    timeRemaining.value =
      typeof flowState.timeRemaining === "number"
        ? flowState.timeRemaining
        : null;
  };

  const fallbackClient = {
    startVerification: async (
      startOptions: {
        policyId?: PolicyId;
        customerUserRef?: string;
        metadata?: Record<string, unknown>;
        provider?: ProviderPreference;
      } = {}
    ) => {
      const body: Record<string, unknown> = {};
      if (startOptions.policyId) {
        body.policyId = startOptions.policyId;
      }
      if (startOptions.customerUserRef) {
        body.customerUserRef = startOptions.customerUserRef;
      }
      if (startOptions.metadata) {
        body.metadata = startOptions.metadata;
      }
      if (startOptions.provider) {
        body.provider = startOptions.provider;
      }

      return await $fetch<{
        verificationId: VerificationId;
        authorizationRequestUrl: string;
        clientToken: ClientToken;
        deepLink?: string;
        expiresAt: string;
      }>(config.verificationEndpoint ?? "/api/authbound/verification", {
        method: "POST",
        body,
      });
    },
    subscribeToStatus: () => () => undefined,
    finalizeVerification: async (id: VerificationId, token: ClientToken) =>
      await $fetch(config.sessionEndpoint ?? "/api/authbound/session", {
        method: "POST",
        body: {
          verificationId: id,
          clientToken: token,
        },
      }),
    getDeepLink: (authorizationRequestUrl: string) => authorizationRequestUrl,
    log: (...args: unknown[]) => {
      if (config.debug) {
        console.log("[Authbound]", ...args);
      }
    },
  } satisfies BrowserVerificationFlowClient;

  const flow = createBrowserVerificationFlow({
    client: client ?? fallbackClient,
    policyId: (options.policyId ?? config.policyId) as PolicyId | undefined,
    sessionMode: config.sessionMode ?? "sdk",
    onStateChange: applyFlowState,
  });

  // Watch status changes
  watch(status, (newStatus, oldStatus) => {
    if (newStatus === oldStatus) return;

    options.onStatusChange?.(newStatus);

    if (newStatus === "verified" && verificationId.value) {
      options.onVerified?.({
        verificationId: verificationId.value,
        status: "verified",
      });

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
  });

  // Start verification
  const startVerification = async () => {
    try {
      await flow.start({
        policyId: (options.policyId ?? config.policyId) as PolicyId | undefined,
        customerUserRef: options.customerUserRef,
        metadata: options.metadata,
        provider: options.provider,
      });
    } catch (err) {
      throw AuthboundError.from(err);
    }
  };

  // Retry
  const retry = async () => {
    reset();
    await startVerification();
  };

  // Reset
  const reset = () => {
    flow.reset();
  };

  // Auto-start
  if (options.autoStart) {
    startVerification();
  }

  // Cleanup
  onUnmounted(() => {
    flow.dispose();
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
