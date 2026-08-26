import type { ClientToken, PolicyId, VerificationId } from "../types/branded";
import { AuthboundError, type AuthboundErrorCode } from "../types/errors";
import type {
  CreateVerificationResponse,
  StatusEvent,
  WalletHandoffKind,
} from "../types/verification";
import { isTerminalStatus } from "../types/verification";
import type {
  ProviderPreference,
  VerificationUiStatus,
} from "../types/verification-contract";

export interface BrowserVerificationFlowStartOptions {
  policyId?: PolicyId;
  customerUserRef?: string;
  metadata?: Record<string, unknown>;
  provider?: ProviderPreference;
}

export interface BrowserVerificationFlowState {
  status: VerificationUiStatus;
  verificationId?: VerificationId;
  authorizationRequestUrl?: string;
  clientToken?: ClientToken;
  deepLink?: string;
  walletHandoffKind?: WalletHandoffKind;
  error?: AuthboundError;
  timeRemaining?: number;
  expiresAt?: Date;
}

export interface BrowserVerificationFlowClient {
  startVerification: (
    options?: BrowserVerificationFlowStartOptions
  ) => Promise<CreateVerificationResponse>;
  subscribeToStatus: (
    verificationId: VerificationId,
    clientToken: ClientToken,
    onEvent: (event: StatusEvent) => void,
    options?: {
      onError?: (error: AuthboundError) => void;
      expiresAt?: Date;
    }
  ) => () => void;
  finalizeVerification: (
    verificationId: VerificationId,
    clientToken: ClientToken
  ) => Promise<unknown>;
  getDeepLink: (authorizationRequestUrl: string) => string;
  log: (...args: unknown[]) => void;
}

export interface BrowserVerificationFlowOptions {
  client: BrowserVerificationFlowClient;
  policyId?: PolicyId;
  sessionMode?: "sdk" | "manual";
  onStateChange?: (state: BrowserVerificationFlowState) => void;
}

export interface BrowserVerificationFlowController {
  getState: () => BrowserVerificationFlowState;
  start: (options?: BrowserVerificationFlowStartOptions) => Promise<void>;
  reset: () => void;
  dispose: () => void;
}

function terminalStatusError(status: VerificationUiStatus): AuthboundError {
  if (status === "timeout") {
    return new AuthboundError("wallet_timeout", "Verification timed out.");
  }
  if (status === "expired") {
    return new AuthboundError("verification_expired", "Verification expired.");
  }
  if (status === "canceled") {
    return new AuthboundError(
      "verification_invalid_state",
      "Verification was canceled."
    );
  }
  return new AuthboundError(
    "verification_invalid_state",
    "Verification did not complete."
  );
}

function isFailureStatus(status: VerificationUiStatus): boolean {
  return (
    status === "failed" ||
    status === "error" ||
    status === "canceled" ||
    status === "expired" ||
    status === "timeout"
  );
}

function shouldSynthesizeDeepLink(
  response: CreateVerificationResponse
): boolean {
  if (
    response.walletHandoffKind === "request_blob" ||
    response.walletHandoffKind === "dc_api"
  ) {
    return false;
  }

  return !isAuthboundHostedVerificationUrl(response.authorizationRequestUrl);
}

function isAuthboundHostedVerificationUrl(value: string): boolean {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }

  const hostname = url.hostname.toLowerCase();
  const isAuthboundHost =
    hostname === "authbound.io" || hostname.endsWith(".authbound.io");

  return (
    (url.protocol === "https:" || url.protocol === "http:") &&
    isAuthboundHost &&
    /^\/v\/[^/]+\/?$/.test(url.pathname)
  );
}

function stateFromResponse(
  client: BrowserVerificationFlowClient,
  response: CreateVerificationResponse
): BrowserVerificationFlowState {
  let deepLink = response.deepLink;
  if (!deepLink && shouldSynthesizeDeepLink(response)) {
    try {
      deepLink = client.getDeepLink(response.authorizationRequestUrl);
    } catch (error) {
      client.log("Failed to generate deep link:", error);
    }
  }

  const state: BrowserVerificationFlowState = {
    status: "pending",
    verificationId: response.verificationId,
    authorizationRequestUrl: response.authorizationRequestUrl,
    clientToken: response.clientToken,
    ...(response.walletHandoffKind
      ? { walletHandoffKind: response.walletHandoffKind }
      : {}),
    expiresAt: new Date(response.expiresAt),
  };

  if (deepLink) {
    state.deepLink = deepLink;
  }

  return state;
}

export function createBrowserVerificationFlow(
  options: BrowserVerificationFlowOptions
): BrowserVerificationFlowController {
  const { client, sessionMode = "sdk", onStateChange } = options;

  let state: BrowserVerificationFlowState = { status: "idle" };
  let statusCleanup: (() => void) | null = null;
  let expiryTimeout: ReturnType<typeof setTimeout> | null = null;
  let countdownInterval: ReturnType<typeof setInterval> | null = null;
  let operationRevision = 0;
  let active = true;
  let activeStart: Promise<void> | null = null;
  let activeStartOptions: BrowserVerificationFlowStartOptions | null = null;
  const finalizedVerificationIds = new Set<string>();

  function emit(nextState: BrowserVerificationFlowState): void {
    state = nextState;
    onStateChange?.(state);
  }

  function cleanupSubscription(): void {
    statusCleanup?.();
    statusCleanup = null;
  }

  function cleanupTimers(): void {
    if (expiryTimeout) {
      clearTimeout(expiryTimeout);
      expiryTimeout = null;
    }
    if (countdownInterval) {
      clearInterval(countdownInterval);
      countdownInterval = null;
    }
  }

  function cleanup(): void {
    cleanupSubscription();
    cleanupTimers();
  }

  function updateTimeRemaining(revision: number): void {
    if (revision !== operationRevision) {
      return;
    }
    if (!state.expiresAt || isTerminalStatus(state.status)) {
      return;
    }

    const timeRemaining = Math.max(
      0,
      Math.floor((state.expiresAt.getTime() - Date.now()) / 1000)
    );
    emit({ ...state, timeRemaining });
  }

  function markTimedOut(revision: number): void {
    if (revision !== operationRevision) {
      return;
    }
    if (isTerminalStatus(state.status)) {
      return;
    }
    cleanup();
    emit({
      ...state,
      status: "timeout",
      error: terminalStatusError("timeout"),
      timeRemaining: 0,
    });
  }

  function scheduleExpiry(
    expiresAt: Date | undefined,
    revision: number
  ): boolean {
    cleanupTimers();

    if (!expiresAt) {
      return true;
    }

    const delay = expiresAt.getTime() - Date.now();
    if (!Number.isFinite(delay) || delay <= 0) {
      markTimedOut(revision);
      return false;
    }

    updateTimeRemaining(revision);
    countdownInterval = setInterval(() => updateTimeRemaining(revision), 1000);
    expiryTimeout = setTimeout(() => markTimedOut(revision), delay);
    return true;
  }

  async function finalizeOnce(
    verificationId: VerificationId,
    clientToken: ClientToken
  ): Promise<void> {
    if (sessionMode === "manual") {
      return;
    }

    if (finalizedVerificationIds.has(verificationId)) {
      return;
    }

    finalizedVerificationIds.add(verificationId);
    try {
      await client.finalizeVerification(verificationId, clientToken);
    } catch (error) {
      finalizedVerificationIds.delete(verificationId);
      throw AuthboundError.from(error);
    }
  }

  async function handleStatusEvent(
    event: StatusEvent,
    verificationId: VerificationId,
    clientToken: ClientToken,
    revision: number
  ): Promise<void> {
    const isCurrent = () =>
      revision === operationRevision && state.verificationId === verificationId;

    if (!isCurrent() || isTerminalStatus(state.status)) {
      return;
    }

    if (event.status === "verified") {
      cleanup();
      try {
        await finalizeOnce(verificationId, clientToken);
      } catch (error) {
        if (!isCurrent()) {
          return;
        }
        cleanup();
        emit({
          ...state,
          status: "error",
          error: AuthboundError.from(error),
        });
        return;
      }
      if (!isCurrent()) {
        return;
      }
    }

    const nextState: BrowserVerificationFlowState = {
      ...state,
      status: event.status,
      ...(event.error
        ? {
            error: new AuthboundError(
              event.error.code as AuthboundErrorCode,
              event.error.message
            ),
          }
        : {}),
    };

    if (!event.error && isFailureStatus(event.status)) {
      nextState.error = terminalStatusError(event.status);
    }

    emit(nextState);

    if (isTerminalStatus(event.status)) {
      cleanup();
    }
  }

  function reset(): void {
    operationRevision += 1;
    activeStart = null;
    activeStartOptions = null;
    cleanup();
    finalizedVerificationIds.clear();
    emit({ status: "idle" });
  }

  async function startOnce(
    startOptions: BrowserVerificationFlowStartOptions
  ): Promise<void> {
    operationRevision += 1;
    const revision = operationRevision;
    cleanup();

    try {
      const response = await client.startVerification({
        policyId: startOptions.policyId ?? options.policyId,
        customerUserRef: startOptions.customerUserRef,
        metadata: startOptions.metadata,
        provider: startOptions.provider,
      });
      if (revision !== operationRevision) {
        return;
      }
      finalizedVerificationIds.delete(response.verificationId);

      const nextState = stateFromResponse(client, response);
      emit(nextState);
      if (!scheduleExpiry(nextState.expiresAt, revision)) {
        return;
      }

      const verificationId = response.verificationId;
      const clientToken = response.clientToken;
      statusCleanup = client.subscribeToStatus(
        verificationId,
        clientToken,
        (event) => {
          handleStatusEvent(event, verificationId, clientToken, revision).catch(
            (error) => {
              client.log("Failed to handle verification status event:", error);
            }
          );
        },
        {
          ...(nextState.expiresAt ? { expiresAt: nextState.expiresAt } : {}),
          onError: (error) => {
            if (revision !== operationRevision) {
              return;
            }
            if (state.verificationId !== verificationId) {
              return;
            }
            cleanup();
            emit({
              ...state,
              status: "error",
              error,
            });
          },
        }
      );
    } catch (error) {
      if (revision !== operationRevision) {
        return;
      }
      const authboundError = AuthboundError.from(error);
      cleanup();
      emit({
        status: "error",
        error: authboundError,
      });
      throw authboundError;
    }
  }

  async function start(
    startOptions: BrowserVerificationFlowStartOptions = {}
  ): Promise<void> {
    if (!active) {
      return;
    }
    const requestedOptions = {
      policyId: startOptions.policyId ?? options.policyId,
      customerUserRef: startOptions.customerUserRef,
      metadata: startOptions.metadata,
      provider: startOptions.provider,
    };
    if (activeStart && activeStartOptions) {
      const isSameStart =
        activeStartOptions.policyId === requestedOptions.policyId &&
        activeStartOptions.customerUserRef ===
          requestedOptions.customerUserRef &&
        activeStartOptions.metadata === requestedOptions.metadata &&
        activeStartOptions.provider === requestedOptions.provider;
      if (!isSameStart) {
        throw new AuthboundError(
          "verification_invalid_state",
          "A verification start is already in progress with different options"
        );
      }
      return activeStart;
    }

    const operation = startOnce(requestedOptions);
    activeStart = operation;
    activeStartOptions = requestedOptions;
    try {
      await operation;
    } finally {
      if (activeStart === operation) {
        activeStart = null;
        activeStartOptions = null;
      }
    }
  }

  return {
    getState: () => state,
    start,
    reset,
    dispose: () => {
      operationRevision += 1;
      active = false;
      activeStart = null;
      activeStartOptions = null;
      cleanup();
    },
  };
}
