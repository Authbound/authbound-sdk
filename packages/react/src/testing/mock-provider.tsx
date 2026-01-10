/**
 * MockAuthboundProvider - Testing utilities for Authbound React SDK.
 *
 * Provides mock implementations for testing verification flows
 * without making actual API calls.
 */

import type {
  AuthboundErrorCode,
  ClientToken,
  EudiVerificationStatus,
  PolicyId,
  SessionId,
  VerificationClaims,
  VerificationResult,
} from "@authbound/core";
import { AuthboundError } from "@authbound/core";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";
import {
  AuthboundContext,
  type AuthboundContextValue,
  type VerificationSession,
} from "../context/authbound-context";
import type { AuthboundAppearance } from "../types/appearance";
import {
  DEFAULT_VARIABLES,
  variablesToCSSProperties,
} from "../types/appearance";

// ============================================================================
// Mock Scenarios
// ============================================================================

/**
 * Predefined test scenarios.
 */
export const MockScenarios = {
  /** Verification succeeds immediately */
  instantSuccess: {
    delay: 0,
    result: "verified" as const,
    claims: { age_over_18: true },
  },

  /** Verification succeeds after 2 seconds */
  normalSuccess: {
    delay: 2000,
    result: "verified" as const,
    claims: { age_over_18: true },
  },

  /** Verification fails after 1 second */
  failure: {
    delay: 1000,
    result: "failed" as const,
    error: new AuthboundError(
      "presentation_rejected",
      "Credentials not accepted"
    ),
  },

  /** Verification times out */
  timeout: {
    delay: 5000,
    result: "timeout" as const,
  },

  /** Network error on start */
  networkError: {
    delay: 0,
    result: "error" as const,
    error: new AuthboundError("network_error", "Network connection failed"),
    failOnStart: true,
  },

  /** Session expired */
  sessionExpired: {
    delay: 3000,
    result: "error" as const,
    error: new AuthboundError("session_expired", "Session has expired"),
  },
} as const;

export type MockScenario = keyof typeof MockScenarios;

// ============================================================================
// Mock Configuration
// ============================================================================

export interface MockConfig {
  /** Test scenario to use */
  scenario?: MockScenario | (typeof MockScenarios)[MockScenario];
  /** Initial status */
  initialStatus?: EudiVerificationStatus;
  /** Custom delay in ms */
  delay?: number;
  /** Custom verification result */
  customResult?: VerificationResult;
  /** Custom error */
  customError?: AuthboundError;
  /** Whether to auto-advance through states */
  autoAdvance?: boolean;
}

// ============================================================================
// Mock Context
// ============================================================================

interface MockContextValue {
  /** Trigger verified state */
  triggerVerified: (result?: VerificationResult) => void;
  /** Trigger failed state */
  triggerFailed: (error?: AuthboundError) => void;
  /** Trigger timeout */
  triggerTimeout: () => void;
  /** Reset to idle */
  triggerReset: () => void;
  /** Set status directly */
  setStatus: (status: EudiVerificationStatus) => void;
  /** Current mock config */
  config: MockConfig;
}

const MockContext = createContext<MockContextValue | null>(null);

/**
 * Hook for programmatic control of mock provider.
 *
 * @example
 * ```tsx
 * const { triggerVerified, triggerFailed } = useMockAuthbound();
 *
 * // Simulate successful verification
 * await triggerVerified({ verdict: 'approved', claims: { age_over_18: true } });
 *
 * // Simulate failure
 * await triggerFailed(new AuthboundError('wallet_rejected'));
 * ```
 */
export function useMockAuthbound(): MockContextValue {
  const context = useContext(MockContext);
  if (!context) {
    throw new Error(
      "useMockAuthbound must be used within a MockAuthboundProvider"
    );
  }
  return context;
}

// ============================================================================
// Mock Session State
// ============================================================================

interface MockSession {
  sessionId: SessionId;
  status: EudiVerificationStatus;
  authorizationRequestUrl: string;
  clientToken: string;
  result?: VerificationResult;
  error?: AuthboundError;
  expiresAt: Date;
}

// ============================================================================
// Mock Provider
// ============================================================================

export interface MockAuthboundProviderProps {
  /** Mock configuration */
  config?: MockConfig;
  /** Appearance customization */
  appearance?: AuthboundAppearance;
  /** Children */
  children: ReactNode;
}

/**
 * Mock provider for testing Authbound components.
 *
 * @example
 * ```tsx
 * import { MockAuthboundProvider, MockScenarios } from '@authbound/react/testing';
 *
 * // Test successful verification
 * <MockAuthboundProvider config={{ scenario: 'normalSuccess' }}>
 *   <VerificationWall>
 *     <ProtectedContent />
 *   </VerificationWall>
 * </MockAuthboundProvider>
 *
 * // Test failure handling
 * <MockAuthboundProvider config={{ scenario: 'failure' }}>
 *   <MyComponent />
 * </MockAuthboundProvider>
 * ```
 */
export function MockAuthboundProvider({
  config = {},
  appearance = {},
  children,
}: MockAuthboundProviderProps) {
  const [session, setSession] = useState<MockSession | null>(null);

  // Resolve scenario
  const resolvedScenario = useMemo(() => {
    if (typeof config.scenario === "string") {
      return MockScenarios[config.scenario];
    }
    return config.scenario;
  }, [config.scenario]);

  // Trigger state changes
  const triggerVerified = useCallback(
    (result?: VerificationResult) => {
      setSession((prev) => {
        if (!prev) return null;
        return {
          ...prev,
          status: "verified",
          result: result ??
            config.customResult ?? {
              verdict: "approved",
              claims: { age_over_18: true },
            },
        };
      });
    },
    [config.customResult]
  );

  const triggerFailed = useCallback(
    (error?: AuthboundError) => {
      setSession((prev) => {
        if (!prev) return null;
        return {
          ...prev,
          status: "failed",
          error:
            error ?? config.customError ?? new AuthboundError("unknown_error"),
        };
      });
    },
    [config.customError]
  );

  const triggerTimeout = useCallback(() => {
    setSession((prev) => {
      if (!prev) return null;
      return { ...prev, status: "timeout" };
    });
  }, []);

  const triggerReset = useCallback(() => {
    setSession(null);
  }, []);

  const setStatus = useCallback((status: EudiVerificationStatus) => {
    setSession((prev) => {
      if (!prev) return null;
      return { ...prev, status };
    });
  }, []);

  // Mock start verification
  const startVerification = useCallback(async () => {
    // Check for fail-on-start scenarios
    const scenario = resolvedScenario as
      | {
          failOnStart?: boolean;
          error?: AuthboundError;
          delay: number;
          result: string;
          claims?: VerificationClaims;
        }
      | undefined;

    if (scenario?.failOnStart) {
      throw scenario.error ?? new AuthboundError("network_error");
    }

    // Create mock session
    const mockSession: MockSession = {
      sessionId: `ses_mock_${Date.now()}` as SessionId,
      status: "pending",
      authorizationRequestUrl: `https://mock.authbound.io/v?session=mock_${Date.now()}`,
      clientToken: "mock_token_" + Date.now(),
      expiresAt: new Date(Date.now() + 5 * 60 * 1000),
    };

    setSession(mockSession);

    // Auto-advance if configured
    if (config.autoAdvance !== false && scenario) {
      const delay = config.delay ?? scenario.delay;

      setTimeout(() => {
        switch (scenario.result) {
          case "verified":
            triggerVerified({
              verdict: "approved",
              claims: scenario.claims ?? {},
            });
            break;
          case "failed":
          case "error":
            triggerFailed(scenario.error);
            break;
          case "timeout":
            triggerTimeout();
            break;
        }
      }, delay);
    }
  }, [
    config,
    resolvedScenario,
    triggerVerified,
    triggerFailed,
    triggerTimeout,
  ]);

  // Mock context value (matches AuthboundContextValue interface)
  const mockContextValue = useMemo(
    (): AuthboundContextValue => ({
      client: {
        config: {
          publishableKey: "pk_test_mock" as any,
          gatewayUrl: "https://mock.authbound.io",
          sessionEndpoint: "/api/mock/session",
          timeout: 30_000,
          debug: false,
          environment: "test" as const,
        },
        startVerification: async () => ({
          sessionId: "ses_mock" as SessionId,
          authorizationRequestUrl: "https://mock.authbound.io/v?session=mock",
          clientToken: "mock_token" as ClientToken,
          expiresAt: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
        }),
        subscribeToStatus: () => () => {},
        pollStatus: async () => ({ status: session?.status ?? "idle" }),
        getDeepLink: () => "authbound://mock",
        getUniversalLink: () => "https://link.authbound.io/mock",
        log: () => {},
      } as any, // Mock client doesn't need full implementation
      isReady: true,
      session: session
        ? ({
            sessionId: session.sessionId,
            status: session.status,
            authorizationRequestUrl: session.authorizationRequestUrl,
            clientToken: session.clientToken as ClientToken,
            result: session.result,
            error: session.error,
            expiresAt: session.expiresAt,
          } as VerificationSession)
        : null,
      appearance,
      policyId: "test-policy@1.0.0" as PolicyId,
      startVerification,
      resetSession: triggerReset,
      updateSession: (update: Partial<VerificationSession>) =>
        setSession((prev) => (prev ? { ...prev, ...update } : null)),
    }),
    [session, appearance, startVerification, triggerReset]
  );

  // Mock control context
  const mockControlValue = useMemo<MockContextValue>(
    () => ({
      triggerVerified,
      triggerFailed,
      triggerTimeout,
      triggerReset,
      setStatus,
      config,
    }),
    [
      triggerVerified,
      triggerFailed,
      triggerTimeout,
      triggerReset,
      setStatus,
      config,
    ]
  );

  // CSS properties
  const cssProperties = useMemo(
    () => variablesToCSSProperties(DEFAULT_VARIABLES),
    []
  );

  // Provide both the mock control context and the real AuthboundContext
  // This allows components using useAuthbound() to work correctly in tests
  return (
    <MockContext.Provider value={mockControlValue}>
      <AuthboundContext.Provider
        value={mockContextValue as AuthboundContextValue}
      >
        <div
          className="ab-root ab-root--mock"
          data-ab-theme={appearance.baseTheme ?? "light"}
          data-testid="mock-authbound-provider"
          style={cssProperties as React.CSSProperties}
        >
          {children}
        </div>
      </AuthboundContext.Provider>
    </MockContext.Provider>
  );
}

// ============================================================================
// Test Utilities
// ============================================================================

/**
 * Wait for a specific status in tests.
 */
export function waitForStatus(
  getStatus: () => EudiVerificationStatus,
  targetStatus: EudiVerificationStatus,
  timeout = 5000
): Promise<void> {
  return new Promise((resolve, reject) => {
    const startTime = Date.now();

    const check = () => {
      if (getStatus() === targetStatus) {
        resolve();
        return;
      }

      if (Date.now() - startTime > timeout) {
        reject(new Error(`Timeout waiting for status: ${targetStatus}`));
        return;
      }

      setTimeout(check, 50);
    };

    check();
  });
}

/**
 * Create a mock verification result.
 */
export function createMockResult(
  claims: VerificationClaims = { age_over_18: true }
): VerificationResult {
  return {
    verdict: "approved",
    claims,
    verified_at: new Date().toISOString(),
  };
}

/**
 * Create a mock error.
 */
export function createMockError(
  code: AuthboundErrorCode = "unknown_error",
  message?: string
): AuthboundError {
  return new AuthboundError(code, message);
}
