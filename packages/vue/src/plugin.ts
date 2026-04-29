/**
 * Authbound Vue Plugin.
 *
 * Provides SDK configuration via Vue's provide/inject system.
 */

import {
  type AuthboundClient,
  type AuthboundClientConfig,
  AuthboundError,
  type AuthboundErrorCode,
  createClient,
  type EudiVerificationStatus,
  type PolicyId,
  type PublishableKey,
  type StatusEvent,
  type VerificationId,
} from "@authbound-sdk/core";
import {
  type App,
  type ComputedRef,
  computed,
  type InjectionKey,
  type Ref,
  readonly,
  ref,
} from "vue";
import type { AuthboundAppearance } from "./types/appearance";
import {
  DARK_THEME_VARIABLES,
  DEFAULT_VARIABLES,
  mergeAppearance,
  variablesToCSSProperties,
} from "./types/appearance";

// ============================================================================
// Types
// ============================================================================

/**
 * Current verification state.
 */
export interface VerificationState {
  /** Verification ID */
  verificationId: VerificationId;
  /** Current status */
  status: EudiVerificationStatus;
  /** Authorization request URL (for QR code) */
  authorizationRequestUrl: string;
  /** Client token for status polling */
  clientToken: string;
  /** Deep link for mobile */
  deepLink?: string;
  /** Error (if failed) */
  error?: AuthboundError;
  /** Time remaining in seconds */
  timeRemaining?: number;
  /** When verification expires */
  expiresAt: Date;
}

/**
 * Authbound context value.
 */
export interface AuthboundContext {
  /** SDK client instance */
  client: AuthboundClient;
  /** Whether SDK is configured and ready */
  isReady: Ref<boolean>;
  /** Current verification (if any) */
  verification: Ref<VerificationState | null>;
  /** Appearance configuration */
  appearance: ComputedRef<AuthboundAppearance>;
  /** Default policy ID */
  policyId?: PolicyId;
  /** CSS custom properties */
  cssProperties: ComputedRef<Record<string, string>>;

  /** Start a new verification */
  startVerification: (options?: {
    policyId?: PolicyId;
    customerUserRef?: string;
    metadata?: Record<string, string>;
    provider?: "auto" | "vcs" | "eudi";
  }) => Promise<void>;

  /** Reset current verification */
  resetVerification: () => void;

  /** Update verification state */
  updateVerification: (update: Partial<VerificationState>) => void;
}

// ============================================================================
// Injection Key
// ============================================================================

export const AuthboundKey: InjectionKey<AuthboundContext> = Symbol("authbound");

// ============================================================================
// Plugin Options
// ============================================================================

export interface AuthboundPluginOptions {
  /** Your publishable key */
  publishableKey: PublishableKey | string;
  /** Default policy for verification */
  policyId?: PolicyId;
  /** Verification creation endpoint (default: /api/authbound/verification) */
  verificationEndpoint?: string;
  /** Gateway URL override (for testing) */
  gatewayUrl?: string;
  /** Appearance customization */
  appearance?: AuthboundAppearance;
  /** Enable debug logging */
  debug?: boolean;
}

// ============================================================================
// Plugin
// ============================================================================

/**
 * Authbound Vue Plugin.
 *
 * @example
 * ```ts
 * // main.ts
 * import { createApp } from 'vue';
 * import { AuthboundPlugin } from '@authbound-sdk/vue';
 *
 * const app = createApp(App);
 *
 * app.use(AuthboundPlugin, {
 *   publishableKey: import.meta.env.VITE_AUTHBOUND_PK,
 *   policyId: 'age-gate-18@1.0.0',
 * });
 *
 * app.mount('#app');
 * ```
 */
export const AuthboundPlugin = {
  install(app: App, options: AuthboundPluginOptions) {
    const {
      publishableKey,
      policyId,
      verificationEndpoint,
      gatewayUrl,
      debug = false,
    } = options;

    // Create client instance
    const clientConfig: AuthboundClientConfig = {
      publishableKey: publishableKey as PublishableKey,
      policyId,
      verificationEndpoint,
      gatewayUrl,
      debug,
    };

    let client: AuthboundClient;
    try {
      client = createClient(clientConfig);
    } catch (error) {
      if (debug) {
        console.error("[Authbound] Failed to create client:", error);
      }
      throw error;
    }

    // Reactive state
    const isReady = ref(false);
    const verification = ref<VerificationState | null>(null);
    let statusCleanup: (() => void) | null = null;

    // Track OS color scheme preference for auto theme
    const prefersDark = ref(
      typeof window !== "undefined"
        ? (window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false)
        : false
    );

    // Listen for OS color scheme changes
    let mediaQueryCleanup: (() => void) | null = null;
    if (typeof window !== "undefined" && window.matchMedia) {
      const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");

      const handleChange = (e: MediaQueryListEvent) => {
        prefersDark.value = e.matches;
      };

      // Modern browsers
      if (mediaQuery.addEventListener) {
        mediaQuery.addEventListener("change", handleChange);
        mediaQueryCleanup = () =>
          mediaQuery.removeEventListener("change", handleChange);
      }
      // Legacy browsers (Safari <14)
      else if (mediaQuery.addListener) {
        mediaQuery.addListener(handleChange);
        mediaQueryCleanup = () => mediaQuery.removeListener(handleChange);
      }
    }

    // Appearance with theme detection (now reactive to OS preference changes)
    const appearance = computed<AuthboundAppearance>(() => {
      const base = options.appearance ?? {};
      const isDark =
        base.baseTheme === "dark" ||
        (base.baseTheme === "auto" && prefersDark.value);

      if (isDark) {
        return mergeAppearance({ variables: DARK_THEME_VARIABLES }, base);
      }

      return base;
    });

    // CSS properties
    const cssProperties = computed(() => {
      const baseVars = variablesToCSSProperties(DEFAULT_VARIABLES);
      const customVars = appearance.value.variables
        ? variablesToCSSProperties(appearance.value.variables)
        : {};
      return { ...baseVars, ...customVars };
    });

    // Mark as ready (client-side only)
    if (typeof window !== "undefined") {
      isReady.value = true;
    }

    // Verification state management
    const updateVerification = (update: Partial<VerificationState>) => {
      if (verification.value) {
        verification.value = { ...verification.value, ...update };
      }
    };

    const cleanupStatusSubscription = () => {
      statusCleanup?.();
      statusCleanup = null;
    };

    const resetVerification = () => {
      cleanupStatusSubscription();
      verification.value = null;
    };

    const startVerification = async (verifyOptions?: {
      policyId?: PolicyId;
      customerUserRef?: string;
      metadata?: Record<string, string>;
      provider?: "auto" | "vcs" | "eudi";
    }) => {
      try {
        cleanupStatusSubscription();

        // Create verification
        const response = await client.startVerification({
          policyId: verifyOptions?.policyId ?? policyId,
          customerUserRef: verifyOptions?.customerUserRef,
          metadata: verifyOptions?.metadata,
          provider: verifyOptions?.provider,
        });

        // Initialize verification state
        const newVerification: VerificationState = {
          verificationId: response.verificationId as VerificationId,
          status: "pending",
          authorizationRequestUrl: response.authorizationRequestUrl,
          clientToken: response.clientToken,
          deepLink: response.deepLink,
          expiresAt: new Date(response.expiresAt),
        };

        verification.value = newVerification;

        // Subscribe to status updates
        statusCleanup = client.subscribeToStatus(
          response.verificationId as VerificationId,
          response.clientToken as Parameters<
            typeof client.subscribeToStatus
          >[1],
          (event: StatusEvent) => {
            if (
              !verification.value ||
              verification.value.verificationId !== response.verificationId
            ) {
              return;
            }

            verification.value = {
              ...verification.value,
              status: event.status,
              error: event.error
                ? new AuthboundError(
                    event.error.code as AuthboundErrorCode,
                    event.error.message
                  )
                : undefined,
            };
          },
          {
            onError: (error) => {
              if (
                !verification.value ||
                verification.value.verificationId !== response.verificationId
              ) {
                return;
              }
              verification.value = {
                ...verification.value,
                status: "error",
                error,
              };
            },
          }
        );
      } catch (error) {
        const authboundError = AuthboundError.from(error);
        verification.value = {
          verificationId: "vrf_error" as VerificationId,
          status: "error",
          authorizationRequestUrl: "",
          clientToken: "",
          error: authboundError,
          expiresAt: new Date(),
        };
        throw authboundError;
      }
    };

    // Context value
    const context: AuthboundContext = {
      client,
      isReady: readonly(isReady) as Ref<boolean>,
      verification: verification as Ref<VerificationState | null>,
      appearance,
      policyId,
      cssProperties,
      startVerification,
      resetVerification,
      updateVerification,
    };

    // Provide to app
    app.provide(AuthboundKey, context);
  },
};

export default AuthboundPlugin;
