/**
 * Authbound Vue Plugin.
 *
 * Provides SDK configuration via Vue's provide/inject system.
 */

import {
  type AuthboundClient,
  type AuthboundClientConfig,
  AuthboundError,
  type BrowserVerificationFlowState,
  createBrowserVerificationFlow,
  createClient,
  type PolicyId,
  type ProviderPreference,
  type PublishableKey,
  type VerificationId,
  type VerificationUiStatus,
  type WalletHandoffKind,
} from "@authbound/core";
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
  status: VerificationUiStatus;
  /** Authorization request URL (for QR code) */
  authorizationRequestUrl: string;
  /** Client token for status polling */
  clientToken: string;
  /** Deep link for mobile */
  deepLink?: string;
  /** Wallet handoff payload kind returned by Authbound */
  walletHandoffKind?: WalletHandoffKind;
  /** Error (if failed) */
  error?: AuthboundError;
  /** Time remaining in seconds */
  timeRemaining?: number;
  /** When verification expires */
  expiresAt: Date;
}

function toVerificationState(
  flowState: BrowserVerificationFlowState
): VerificationState | null {
  if (flowState.status === "idle") {
    return null;
  }

  const base = {
    verificationId: (flowState.verificationId ?? "vrf_error") as VerificationId,
    status: flowState.status,
    authorizationRequestUrl: flowState.authorizationRequestUrl ?? "",
    clientToken: flowState.clientToken ?? "",
    expiresAt: flowState.expiresAt ?? new Date(),
  };

  return {
    ...base,
    ...(flowState.deepLink ? { deepLink: flowState.deepLink } : {}),
    ...(flowState.walletHandoffKind
      ? { walletHandoffKind: flowState.walletHandoffKind }
      : {}),
    ...(flowState.error ? { error: flowState.error } : {}),
    ...(typeof flowState.timeRemaining === "number"
      ? { timeRemaining: flowState.timeRemaining }
      : {}),
  };
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
    metadata?: Record<string, unknown>;
    provider?: ProviderPreference;
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
  /** Browser session finalization endpoint (default: /api/authbound/session) */
  sessionEndpoint?: string;
  /** Whether the SDK should create its own browser session binding */
  sessionMode?: "sdk" | "manual";
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
 * import { asPolicyId, AuthboundPlugin } from '@authbound/vue';
 *
 * const policyId = asPolicyId(import.meta.env.VITE_AUTHBOUND_POLICY_ID);
 * const app = createApp(App);
 *
 * app.use(AuthboundPlugin, {
 *   publishableKey: import.meta.env.VITE_AUTHBOUND_PK,
 *   policyId,
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
      sessionEndpoint,
      sessionMode = "sdk",
      gatewayUrl,
      debug = false,
    } = options;

    // Create client instance
    const clientConfig: AuthboundClientConfig = {
      publishableKey: publishableKey as PublishableKey,
      policyId,
      verificationEndpoint,
      sessionEndpoint,
      sessionMode,
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

    const flow = createBrowserVerificationFlow({
      client,
      policyId,
      sessionMode,
      onStateChange: (flowState) => {
        verification.value = toVerificationState(flowState);
      },
    });
    app.onUnmount(() => flow.dispose());

    const resetVerification = () => {
      flow.reset();
    };

    const startVerification = async (verifyOptions?: {
      policyId?: PolicyId;
      customerUserRef?: string;
      metadata?: Record<string, unknown>;
      provider?: ProviderPreference;
    }) => {
      try {
        await flow.start({
          policyId: verifyOptions?.policyId ?? policyId,
          customerUserRef: verifyOptions?.customerUserRef,
          metadata: verifyOptions?.metadata,
          provider: verifyOptions?.provider,
        });
      } catch (error) {
        throw AuthboundError.from(error);
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
