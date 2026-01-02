import {
  QuickID as QuickIDClient,
  type QuickIDConfig,
  type QuickIDPhase,
  type VerificationResult,
  QuickIDError,
} from "@authbound/quickid-core";
import { useCallback, useEffect, useRef, useState } from "react";

export interface UseQuickIDConfig extends QuickIDConfig {
  /**
   * URL to your backend's QuickID session proxy.
   * Defaults to "/api/quickid" if not provided.
   * Used when start() is called without a token.
   */
  proxyUrl?: string;
}

export interface UseQuickIDState {
  phase: QuickIDPhase;
  result: VerificationResult | null;
  error: string | null;
  errorCode: string | null;
  isBusy: boolean;
  clientToken: string | null;
}

export interface UseQuickID {
  state: UseQuickIDState;
  /**
   * Starts the flow.
   * If clientToken is provided, uses it.
   * If not, attempts to fetch one from the configured proxyUrl.
   */
  start: (clientToken?: string) => Promise<void>;
  /**
   * Sets the document file and advances phase.
   */
  setDocument: (file: File) => void;
  /**
   * Sets the selfie file.
   * If submitImmediately is true (default), calls submit() right away.
   */
  setSelfie: (file: File, submitImmediately?: boolean) => Promise<void>;
  /**
   * Submits the collected files for verification.
   */
  submit: () => Promise<void>;
  /**
   * Resets the state to idle.
   */
  reset: () => void;
}

/**
 * React hook wrapping the QuickID core client.
 */
export function useQuickID(config: UseQuickIDConfig): UseQuickID {
  const [phase, setPhase] = useState<QuickIDPhase>("idle");
  const [clientToken, setClientToken] = useState<string | null>(null);
  const [result, setResult] = useState<VerificationResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);

  // Local file state
  const [documentFile, setDocumentFile] = useState<File | null>(null);
  const [selfieFile, setSelfieFile] = useState<File | null>(null);

  const quickIdRef = useRef<QuickIDClient | null>(null);
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    quickIdRef.current = new QuickIDClient(config);

    return () => {
      isMountedRef.current = false;
      quickIdRef.current = null;
    };
  }, [config.apiBaseUrl, config.pollIntervalMs, config.fetch]);

  const safeSetState = useCallback(<T>(setFn: (value: T) => void, value: T) => {
    if (!isMountedRef.current) return;
    setFn(value);
  }, []);

  const handleError = useCallback(
    (err: unknown, defaultMessage: string) => {
      let message = defaultMessage;
      let code = "UNKNOWN_ERROR";

      if (err instanceof QuickIDError) {
        message = err.message;
        code = err.code;
      } else if (err instanceof Error) {
        message = err.message;
      }

      safeSetState(setError, message);
      safeSetState(setErrorCode, code);
    },
    [safeSetState]
  );

  const start = useCallback(
    async (token?: string) => {
      safeSetState(setError, null);
      safeSetState(setErrorCode, null);
      safeSetState(setIsBusy, true);

      let activeToken = token;

      if (!activeToken) {
        try {
          const proxyUrl = config.proxyUrl || "/api/quickid";
          const res = await fetch(proxyUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
          });

          if (!res.ok) {
            throw new Error(
              `Failed to create session: ${res.status} ${res.statusText}`
            );
          }

          const data = await res.json();
          if (!data.client_token) {
            throw new Error("Proxy response missing client_token");
          }
          activeToken = data.client_token;
        } catch (err) {
          handleError(err, "Failed to initialize session");
          safeSetState(setIsBusy, false);
          return;
        }
      }

      if (activeToken) {
        safeSetState(setClientToken, activeToken);
        safeSetState(setResult, null);
        safeSetState(setDocumentFile, null);
        safeSetState(setSelfieFile, null);
        safeSetState(setPhase, "awaiting_document");
      }

      safeSetState(setIsBusy, false);
    },
    [safeSetState, config, handleError]
  );

  const setDocument = useCallback(
    (file: File) => {
      safeSetState(setDocumentFile, file);
      safeSetState(setError, null); // Clear previous errors if any
      safeSetState(setPhase, "awaiting_selfie");
    },
    [safeSetState]
  );

  // To handle the async state update issue, we'll use refs for files
  const docRef = useRef<File | null>(null);
  const selfieRef = useRef<File | null>(null);
  const tokenRef = useRef<string | null>(null);

  // Sync refs
  useEffect(() => {
    docRef.current = documentFile;
  }, [documentFile]);
  useEffect(() => {
    selfieRef.current = selfieFile;
  }, [selfieFile]);
  useEffect(() => {
    tokenRef.current = clientToken;
  }, [clientToken]);

  const submitImplementation = useCallback(async () => {
    if (!quickIdRef.current) return;
    if (!tokenRef.current) {
      handleError(new Error("Missing client token"), "Session not started");
      return;
    }
    if (!docRef.current || !selfieRef.current) {
      handleError(
        new Error("Missing files"),
        "Please upload both document and selfie"
      );
      return;
    }

    safeSetState(setIsBusy, true);
    safeSetState(setError, null);
    safeSetState(setErrorCode, null);
    safeSetState(setPhase, "verifying");

    try {
      const res = await quickIdRef.current.submitVerification(
        tokenRef.current,
        docRef.current,
        selfieRef.current
      );

      safeSetState(setResult, res);

      // If pending, poll
      if (res.status === "PENDING") {
        // Start polling
        for await (const update of quickIdRef.current.pollResult(
          tokenRef.current,
          res.session_id
        )) {
          if (!isMountedRef.current) return;
          safeSetState(setResult, update);
          if (update.status !== "PENDING") {
            break;
          }
        }
      }

      safeSetState(setPhase, "done");
    } catch (err) {
      handleError(err, "Verification failed");
      safeSetState(setPhase, "done");
    } finally {
      safeSetState(setIsBusy, false);
    }
  }, [safeSetState, handleError]);

  const setSelfie = useCallback(
    async (file: File, submitImmediately = true) => {
      safeSetState(setSelfieFile, file);
      // Update ref immediately for the submit call
      selfieRef.current = file;

      if (submitImmediately) {
        await submitImplementation();
      }
    },
    [safeSetState, submitImplementation]
  );

  const reset = useCallback(() => {
    safeSetState(setPhase, "idle");
    safeSetState(setClientToken, null);
    safeSetState(setResult, null);
    safeSetState(setError, null);
    safeSetState(setErrorCode, null);
    safeSetState(setIsBusy, false);
    safeSetState(setDocumentFile, null);
    safeSetState(setSelfieFile, null);
    docRef.current = null;
    selfieRef.current = null;
    tokenRef.current = null;
  }, [safeSetState]);

  return {
    state: {
      phase,
      result,
      error,
      errorCode,
      isBusy,
      clientToken,
    },
    start,
    setDocument,
    setSelfie,
    submit: submitImplementation,
    reset,
  };
}
