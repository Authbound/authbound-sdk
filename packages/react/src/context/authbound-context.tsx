/**
 * Authbound React Context and Provider.
 *
 * Provides SDK configuration and state to child components.
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
  type SessionId,
  type StatusEvent,
  type VerificationResult,
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
 * Context value provided to children.
 */
export interface AuthboundContextValue {
  /** SDK client instance */
  client: AuthboundClient;
  /** Whether SDK is configured and ready */
  isReady: boolean;
  /** Current session (if any) */
  session: VerificationSession | null;
  /** Appearance configuration */
  appearance: AuthboundAppearance;
  /** Default policy ID */
  policyId?: PolicyId;

  /** Start a new verification session */
  startVerification: (options?: {
    policyId?: PolicyId;
    customerUserRef?: string;
    metadata?: Record<string, string>;
  }) => Promise<void>;

  /** Reset current session */
  resetSession: () => void;

  /** Update session state (internal use) */
  updateSession: (update: Partial<VerificationSession>) => void;
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
  /** Session creation endpoint (default: /api/authbound/session) */
  sessionEndpoint?: string;
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
 * import { AuthboundProvider } from '@authbound/react';
 *
 * export default function RootLayout({ children }) {
 *   return (
 *     <AuthboundProvider
 *       publishableKey={process.env.NEXT_PUBLIC_AUTHBOUND_PK!}
 *       policyId="age-gate-18@1.0.0"
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
  sessionEndpoint,
  gatewayUrl,
  appearance: appearanceProp,
  debug = false,
  children,
}: AuthboundProviderProps) {
  const [session, setSession] = useState<VerificationSession | null>(null);
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
        sessionEndpoint,
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
  }, [publishableKey, policyId, sessionEndpoint, gatewayUrl, debug]);

  // Mark as ready after mount
  useEffect(() => {
    setIsReady(true);
  }, []);

  // Update session helper
  const updateSession = useCallback((update: Partial<VerificationSession>) => {
    setSession((prev) => (prev ? { ...prev, ...update } : null));
  }, []);

  // Reset session
  const resetSession = useCallback(() => {
    setSession(null);
  }, []);

  // Start verification
  const startVerification = useCallback(
    async (options?: {
      policyId?: PolicyId;
      customerUserRef?: string;
      metadata?: Record<string, string>;
    }) => {
      try {
        // Create session
        const response = await client.startVerification({
          policyId: options?.policyId ?? policyId,
          customerUserRef: options?.customerUserRef,
          metadata: options?.metadata,
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

        setSession(newSession);

        // Subscribe to status updates
        client.subscribeToStatus(
          response.sessionId as SessionId,
          response.clientToken as Parameters<
            typeof client.subscribeToStatus
          >[1],
          (event: StatusEvent) => {
            setSession((prev) => {
              if (!prev || prev.sessionId !== response.sessionId) return prev;

              return {
                ...prev,
                status: event.status,
                result: event.result,
                error: event.error
                  ? new AuthboundError(
                      event.error.code as AuthboundErrorCode,
                      event.error.message
                    )
                  : undefined,
                timeRemaining: undefined, // Will be updated by timer
              };
            });
          },
          {
            onError: (error) => {
              setSession((prev) => {
                if (!prev || prev.sessionId !== response.sessionId) return prev;
                return {
                  ...prev,
                  status: "error",
                  error,
                };
              });
            },
          }
        );
      } catch (error) {
        const authboundError = AuthboundError.from(error);
        setSession({
          sessionId: "ses_error" as SessionId,
          status: "error",
          authorizationRequestUrl: "",
          clientToken: "",
          error: authboundError,
          expiresAt: new Date(),
        });
        throw authboundError;
      }
    },
    [client, policyId]
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
      session,
      appearance,
      policyId,
      startVerification,
      resetSession,
      updateSession,
    }),
    [
      client,
      isReady,
      session,
      appearance,
      policyId,
      startVerification,
      resetSession,
      updateSession,
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
