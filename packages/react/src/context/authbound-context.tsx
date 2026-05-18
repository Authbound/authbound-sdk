/**
 * Authbound React Context and Provider.
 *
 * Provides SDK configuration and state to child components.
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
  Component,
  createContext,
  type ErrorInfo,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { AuthboundAppearance } from "../types/appearance";
import {
  DARK_THEME_VARIABLES,
  DEFAULT_VARIABLES,
  mergeAppearance,
  variablesToCSSProperties,
} from "../types/appearance";

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
 * Context value provided to children.
 */
export interface AuthboundContextValue {
  /** SDK client instance */
  client: AuthboundClient;
  /** Whether SDK is configured and ready */
  isReady: boolean;
  /** Current verification (if any) */
  verification: VerificationState | null;
  /** Appearance configuration */
  appearance: AuthboundAppearance;
  /** Default policy ID */
  policyId?: PolicyId;

  /** Start a new verification */
  startVerification: (options?: {
    policyId?: PolicyId;
    customerUserRef?: string;
    metadata?: Record<string, string>;
    provider?: ProviderPreference;
  }) => Promise<void>;

  /** Reset current verification */
  resetVerification: () => void;

  /** Update verification state (internal use) */
  updateVerification: (update: Partial<VerificationState>) => void;
}

// ============================================================================
// Context
// ============================================================================

/**
 * Main Authbound context.
 * Exported for use by MockAuthboundProvider in testing utilities.
 * @internal
 */
export const AuthboundContext = createContext<AuthboundContextValue | null>(
  null
);

// ============================================================================
// Provider Props
// ============================================================================

export interface AuthboundProviderProps {
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
  /** Child components */
  children: ReactNode;
}

// ============================================================================
// Provider Component
// ============================================================================

/**
 * Authbound Provider - wrap your app to enable verification.
 *
 * @example
 * ```tsx
 * // app/layout.tsx
 * import { asPolicyId, AuthboundProvider } from '@authbound/react';
 *
 * const policyId = asPolicyId(process.env.NEXT_PUBLIC_AUTHBOUND_POLICY_ID!);
 *
 * export default function RootLayout({ children }) {
 *   return (
 *     <AuthboundProvider
 *       publishableKey={process.env.NEXT_PUBLIC_AUTHBOUND_PK!}
 *       policyId={policyId}
 *     >
 *       {children}
 *     </AuthboundProvider>
 *   );
 * }
 * ```
 */
export function AuthboundProvider({
  publishableKey,
  policyId,
  verificationEndpoint,
  sessionEndpoint,
  sessionMode = "sdk",
  gatewayUrl,
  appearance: appearanceProp,
  debug = false,
  children,
}: AuthboundProviderProps) {
  const [verification, setVerification] = useState<VerificationState | null>(
    null
  );
  const [isReady, setIsReady] = useState(false);

  // Track OS color scheme preference for auto theme
  const [prefersDark, setPrefersDark] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false;
  });

  // Listen for OS color scheme changes
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;

    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");

    const handleChange = (e: MediaQueryListEvent) => {
      setPrefersDark(e.matches);
    };

    // Modern browsers
    if (mediaQuery.addEventListener) {
      mediaQuery.addEventListener("change", handleChange);
      return () => mediaQuery.removeEventListener("change", handleChange);
    }
    // Legacy browsers (Safari <14)
    if (mediaQuery.addListener) {
      mediaQuery.addListener(handleChange);
      return () => mediaQuery.removeListener(handleChange);
    }
  }, []);

  // Resolve appearance with theme (now reactive to OS preference changes)
  const appearance = useMemo(() => {
    const base = appearanceProp ?? {};
    const isDark =
      base.baseTheme === "dark" || (base.baseTheme === "auto" && prefersDark);

    if (isDark) {
      return mergeAppearance({ variables: DARK_THEME_VARIABLES }, base);
    }

    return base;
  }, [appearanceProp, prefersDark]);

  // Create client instance
  const client = useMemo(() => {
    try {
      const config: AuthboundClientConfig = {
        publishableKey: publishableKey as PublishableKey,
        policyId,
        verificationEndpoint,
        sessionEndpoint,
        sessionMode,
        gatewayUrl,
        debug,
      };
      return createClient(config);
    } catch (error) {
      if (debug) {
        console.error("[Authbound] Failed to create client:", error);
      }
      throw error;
    }
  }, [
    publishableKey,
    policyId,
    verificationEndpoint,
    sessionEndpoint,
    sessionMode,
    gatewayUrl,
    debug,
  ]);

  // Mark as ready after mount
  useEffect(() => {
    setIsReady(true);
  }, []);

  // Update verification helper
  const updateVerification = useCallback(
    (update: Partial<VerificationState>) => {
      setVerification((prev) => (prev ? { ...prev, ...update } : null));
    },
    []
  );

  const flow = useMemo(
    () =>
      createBrowserVerificationFlow({
        client,
        policyId,
        sessionMode,
        onStateChange: (flowState) => {
          setVerification(toVerificationState(flowState));
        },
      }),
    [client, policyId, sessionMode]
  );

  useEffect(() => () => flow.dispose(), [flow]);

  // Reset verification
  const resetVerification = useCallback(() => {
    flow.reset();
  }, [flow]);

  // Start verification
  const startVerification = useCallback(
    async (options?: {
      policyId?: PolicyId;
      customerUserRef?: string;
      metadata?: Record<string, string>;
      provider?: ProviderPreference;
    }) => {
      try {
        await flow.start({
          policyId: options?.policyId ?? policyId,
          customerUserRef: options?.customerUserRef,
          metadata: options?.metadata,
          provider: options?.provider,
        });
      } catch (error) {
        throw AuthboundError.from(error);
      }
    },
    [flow, policyId]
  );

  // Build CSS custom properties
  const cssProperties = useMemo(() => {
    const baseVars = variablesToCSSProperties(DEFAULT_VARIABLES);
    const customVars = appearance.variables
      ? variablesToCSSProperties(appearance.variables)
      : {};
    return { ...baseVars, ...customVars };
  }, [appearance.variables]);

  // Context value
  const value = useMemo<AuthboundContextValue>(
    () => ({
      client,
      isReady,
      verification,
      appearance,
      policyId,
      startVerification,
      resetVerification,
      updateVerification,
    }),
    [
      client,
      isReady,
      verification,
      appearance,
      policyId,
      startVerification,
      resetVerification,
      updateVerification,
    ]
  );

  return (
    <AuthboundContext.Provider value={value}>
      <div
        className="ab-root"
        data-ab-theme={appearance.baseTheme ?? "light"}
        style={cssProperties as React.CSSProperties}
      >
        {children}
      </div>
    </AuthboundContext.Provider>
  );
}

// ============================================================================
// Error Boundary
// ============================================================================

/**
 * Props for AuthboundErrorBoundary component.
 */
export interface AuthboundErrorBoundaryProps {
  /** Child components to wrap */
  children: ReactNode;
  /** Custom fallback UI when an error occurs */
  fallback?:
    | ReactNode
    | ((props: { error: Error; reset: () => void }) => ReactNode);
  /** Callback when an error is caught */
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
  /** Enable debug logging */
  debug?: boolean;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

/**
 * Error boundary for Authbound components.
 *
 * Catches errors in child components and displays a fallback UI
 * instead of crashing the entire app.
 *
 * @example
 * ```tsx
 * import { AuthboundErrorBoundary, AuthboundProvider } from '@authbound/react';
 *
 * function App() {
 *   return (
 *     <AuthboundErrorBoundary
 *       fallback={({ error, reset }) => (
 *         <div>
 *           <p>Something went wrong: {error.message}</p>
 *           <button onClick={reset}>Try again</button>
 *         </div>
 *       )}
 *       onError={(error) => console.error('Authbound error:', error)}
 *     >
 *       <AuthboundProvider publishableKey="pk_...">
 *         <YourApp />
 *       </AuthboundProvider>
 *     </AuthboundErrorBoundary>
 *   );
 * }
 * ```
 */
export class AuthboundErrorBoundary extends Component<
  AuthboundErrorBoundaryProps,
  ErrorBoundaryState
> {
  constructor(props: AuthboundErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    const { onError, debug } = this.props;

    // Log in debug mode
    if (debug) {
      console.error("[Authbound] Error caught by boundary:", error);
      console.error("[Authbound] Component stack:", errorInfo.componentStack);
    }

    // Call error callback
    onError?.(error, errorInfo);
  }

  reset = (): void => {
    this.setState({ hasError: false, error: null });
  };

  render(): ReactNode {
    const { hasError, error } = this.state;
    const { children, fallback } = this.props;

    if (hasError && error) {
      // Custom fallback (function or element)
      if (typeof fallback === "function") {
        return fallback({ error, reset: this.reset });
      }

      if (fallback) {
        return fallback;
      }

      // Default fallback UI
      return (
        <div
          className="ab-error-boundary"
          style={{
            padding: "24px",
            borderRadius: "8px",
            backgroundColor: "var(--ab-color-error-background, #fef2f2)",
            border: "1px solid var(--ab-color-error, #ef4444)",
            textAlign: "center",
            fontFamily: "var(--ab-font-family, system-ui, sans-serif)",
          }}
        >
          <div
            style={{
              marginBottom: "12px",
              fontSize: "var(--ab-font-size-lg, 1.125rem)",
              fontWeight: 600,
              color: "var(--ab-color-error, #ef4444)",
            }}
          >
            Something went wrong
          </div>
          <div
            style={{
              marginBottom: "16px",
              fontSize: "var(--ab-font-size-sm, 0.875rem)",
              color: "var(--ab-color-muted-foreground, #6b7280)",
            }}
          >
            {error.message || "An unexpected error occurred"}
          </div>
          <button
            onClick={this.reset}
            style={{
              padding: "8px 16px",
              fontSize: "var(--ab-font-size-sm, 0.875rem)",
              fontWeight: 500,
              color: "#ffffff",
              backgroundColor: "var(--ab-color-primary, #0066cc)",
              border: "none",
              borderRadius: "6px",
              cursor: "pointer",
            }}
            type="button"
          >
            Try again
          </button>
        </div>
      );
    }

    return children;
  }
}

// ============================================================================
// Hook
// ============================================================================

/**
 * Access Authbound context.
 *
 * @throws Error if used outside AuthboundProvider
 */
export function useAuthbound(): AuthboundContextValue {
  const context = useContext(AuthboundContext);

  if (!context) {
    throw new Error(
      "useAuthbound must be used within an AuthboundProvider. " +
        "Wrap your app with <AuthboundProvider> to use Authbound hooks."
    );
  }

  return context;
}

/**
 * Access Authbound context, returning null if not available.
 *
 * Useful for components that should work with or without the provider.
 */
export function useAuthboundOptional(): AuthboundContextValue | null {
  return useContext(AuthboundContext);
}
