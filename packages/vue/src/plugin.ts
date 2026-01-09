/**
 * Authbound Vue Plugin.
 *
 * Provides SDK configuration via Vue's provide/inject system.
 */

import {
  ref,
  reactive,
  computed,
  readonly,
  watch,
  onMounted,
  onUnmounted,
  type App,
  type InjectionKey,
  type Ref,
  type ComputedRef,
} from "vue";
import {
  createClient,
  type AuthboundClient,
  type AuthboundClientConfig,
  type PublishableKey,
  type PolicyId,
  type SessionId,
  type EudiVerificationStatus,
  type VerificationResult,
  type StatusEvent,
  type AuthboundErrorCode,
  AuthboundError,
} from "@authbound/core";
import type { AuthboundAppearance } from "./types/appearance";
import {
  DEFAULT_VARIABLES,
  DARK_THEME_VARIABLES,
  variablesToCSSProperties,
  mergeAppearance,
} from "./types/appearance";

// ============================================================================
// Types
// ============================================================================

/**
 * Current verification session state.
 */
export interface VerificationSession {
  /** Session ID */
  sessionId: SessionId;
  /** Current status */
  status: EudiVerificationStatus;
  /** Authorization request URL (for QR code) */
  authorizationRequestUrl: string;
  /** Client token for status polling */
  clientToken: string;
  /** Deep link for mobile */
  deepLink?: string;
  /** Verification result (when completed) */
  result?: VerificationResult;
  /** Error (if failed) */
  error?: AuthboundError;
  /** Time remaining in seconds */
  timeRemaining?: number;
  /** When session expires */
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
  /** Current session (if any) */
  session: Ref<VerificationSession | null>;
  /** Appearance configuration */
  appearance: ComputedRef<AuthboundAppearance>;
  /** Default policy ID */
  policyId?: PolicyId;
  /** CSS custom properties */
  cssProperties: ComputedRef<Record<string, string>>;

  /** Start a new verification session */
  startVerification: (options?: {
    policyId?: PolicyId;
    customerUserRef?: string;
    metadata?: Record<string, string>;
  }) => Promise<void>;

  /** Reset current session */
  resetSession: () => void;

  /** Update session state */
  updateSession: (update: Partial<VerificationSession>) => void;
}

// ============================================================================
// Injection Key
// ============================================================================

export const AuthboundKey: InjectionKey<AuthboundContext> =
  Symbol("authbound");

// ============================================================================
// Plugin Options
// ============================================================================

export interface AuthboundPluginOptions {
  /** Your publishable key */
  publishableKey: PublishableKey | string;
  /** Default policy for verification */
  policyId?: PolicyId;
  /** Session creation endpoint (default: /api/authbound/session) */
  sessionEndpoint?: string;
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
 * import { AuthboundPlugin } from '@authbound/vue';
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
    const { publishableKey, policyId, sessionEndpoint, gatewayUrl, debug = false } =
      options;

    // Create client instance
    const clientConfig: AuthboundClientConfig = {
      publishableKey: publishableKey as PublishableKey,
      policyId,
      sessionEndpoint,
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
    const session = ref<VerificationSession | null>(null);

    // Track OS color scheme preference for auto theme
    const prefersDark = ref(
      typeof window !== "undefined"
        ? window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false
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
        mediaQueryCleanup = () => mediaQuery.removeEventListener("change", handleChange);
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

    // Session management
    const updateSession = (update: Partial<VerificationSession>) => {
      if (session.value) {
        session.value = { ...session.value, ...update };
      }
    };

    const resetSession = () => {
      session.value = null;
    };

    const startVerification = async (verifyOptions?: {
      policyId?: PolicyId;
      customerUserRef?: string;
      metadata?: Record<string, string>;
    }) => {
      try {
        // Create session
        const response = await client.startVerification({
          policyId: verifyOptions?.policyId ?? policyId,
          customerUserRef: verifyOptions?.customerUserRef,
          metadata: verifyOptions?.metadata,
        });

        // Initialize session state
        const newSession: VerificationSession = {
          sessionId: response.sessionId as SessionId,
          status: "pending",
          authorizationRequestUrl: response.authorizationRequestUrl,
          clientToken: response.clientToken,
          deepLink: response.deepLink,
          expiresAt: new Date(response.expiresAt),
        };

        session.value = newSession;

        // Subscribe to status updates
        client.subscribeToStatus(
          response.sessionId as SessionId,
          response.clientToken as Parameters<typeof client.subscribeToStatus>[1],
          (event: StatusEvent) => {
            if (!session.value || session.value.sessionId !== response.sessionId) {
              return;
            }

            session.value = {
              ...session.value,
              status: event.status,
              result: event.result,
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
              if (!session.value || session.value.sessionId !== response.sessionId) {
                return;
              }
              session.value = {
                ...session.value,
                status: "error",
                error,
              };
            },
          }
        );
      } catch (error) {
        const authboundError = AuthboundError.from(error);
        session.value = {
          sessionId: "ses_error" as SessionId,
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
      session: session as Ref<VerificationSession | null>,
      appearance,
      policyId,
      cssProperties,
      startVerification,
      resetSession,
      updateSession,
    };

    // Provide to app
    app.provide(AuthboundKey, context);
  },
};

export default AuthboundPlugin;
