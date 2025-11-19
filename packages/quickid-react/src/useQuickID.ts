import {
  type CreateSessionInput,
  QuickID as QuickIDClient,
  type QuickIDConfig,
  type QuickIdResult,
  type QuickIdSession,
  QuickIDError,
} from "@authbound/quickid-core";
import { useCallback, useEffect, useRef, useState } from "react";

export type QuickIDUiPhase =
  | "idle"
  | "creating_session"
  | "awaiting_document"
  | "awaiting_selfie"
  | "verifying"
  | "done";

export interface UseQuickIDState {
  phase: QuickIDUiPhase;
  session: QuickIdSession | null;
  result: QuickIdResult | null;
  error: string | null;
  errorCode: string | null;
  isBusy: boolean;
}

export interface UseQuickID {
  state: UseQuickIDState;
  start: (input?: CreateSessionInput) => Promise<void>;
  uploadDocument: (file: File, side?: "front" | "back") => Promise<void>;
  uploadSelfieAndVerify: (file: File) => Promise<void>;
  reset: () => void;
}

/**
 * React hook wrapping the QuickID core client.
 *
 * Keeps all asynchronous flow and state transitions in one place.
 */
export function useQuickID(config: QuickIDConfig): UseQuickID {
  const [phase, setPhase] = useState<QuickIDUiPhase>("idle");
  const [session, setSession] = useState<QuickIdSession | null>(null);
  const [result, setResult] = useState<QuickIdResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);

  const quickIdRef = useRef<QuickIDClient | null>(null);
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    quickIdRef.current = new QuickIDClient(config);

    return () => {
      isMountedRef.current = false;
      quickIdRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    config.apiBaseUrl,
    config.token,
    config.upload,
    config.pollIntervalMs,
    config.defaultLevel,
  ]);

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
    async (input?: CreateSessionInput) => {
      if (!quickIdRef.current) return;

      safeSetState(setIsBusy, true);
      safeSetState(setError, null);
      safeSetState(setErrorCode, null);
      safeSetState(setResult, null);
      safeSetState(setPhase, "creating_session");

      try {
        const session = await quickIdRef.current.createSession(input);
        safeSetState(setSession, session);
        safeSetState(setPhase, "awaiting_document");
      } catch (err) {
        handleError(err, "Failed to create QuickID session");
        safeSetState(setPhase, "idle");
      } finally {
        safeSetState(setIsBusy, false);
      }
    },
    [safeSetState, handleError]
  );

  const uploadDocument = useCallback(
    async (file: File, side: "front" | "back" = "front") => {
      if (!quickIdRef.current) return;

      safeSetState(setIsBusy, true);
      safeSetState(setError, null);
      safeSetState(setErrorCode, null);

      try {
        const updatedSession = await quickIdRef.current.uploadDocument(
          file,
          side
        );
        safeSetState(setSession, updatedSession);

        // Only advance phase if we are done with documents.
        // This logic could be improved if the session state included "documents needed".
        // For now, the UI drives the flow, so we might leave phase management to the UI
        // or assume 'front' implies we are done if it's a passport, but that's tricky.
        //
        // IMPORTANT: The Core/Backend should dictate the state.
        // If the session status remains 'created' or 'document_uploaded', we might stay in 'awaiting_document'.
        // However, the UI layer often needs fine-grained control.
        // We'll optimistically advance to 'awaiting_selfie' ONLY if the user logic decides so.
        // BUT, `useQuickID` was originally opinionated.
        // Let's keep the original behavior: uploadDocument -> awaiting_selfie.
        // Consumers calling uploadDocument('front') then uploadDocument('back')
        // might flicker the phase.
        //
        // BETTER APPROACH: Don't auto-advance phase on document upload inside the hook,
        // OR let the session status dictate.
        //
        // Current legacy behavior:
        // safeSetState(setPhase, 'awaiting_selfie');
        //
        // We'll stick to legacy for 'front' or default, but maybe we should expose a way to not advance.
        // For simplicity in this refactor: we update the session.

        // If the session status suggests we are ready for selfie (e.g. if backend tracks required docs)
        // we could switch. For now, we will trust the caller or just update the session.
        // The Example App manually handles steps, so the phase in this hook is less critical
        // if the app uses `start/uploadDocument` imperatively.

        safeSetState(setPhase, "awaiting_selfie");
      } catch (err) {
        handleError(err, "Failed to upload document");
      } finally {
        safeSetState(setIsBusy, false);
      }
    },
    [safeSetState, handleError]
  );

  const uploadSelfieAndVerify = useCallback(
    async (file: File) => {
      if (!quickIdRef.current) return;

      safeSetState(setIsBusy, true);
      safeSetState(setError, null);
      safeSetState(setErrorCode, null);
      safeSetState(setPhase, "verifying");

      try {
        const sessionAfterSelfie = await quickIdRef.current.uploadSelfie(file);
        safeSetState(setSession, sessionAfterSelfie);

        // Kick off verification + polling loop
        const verifiedSession = await quickIdRef.current.verify();
        safeSetState(setSession, verifiedSession);

        // If backend sets status immediately:
        if (verifiedSession.status === "verified" && verifiedSession.result) {
          safeSetState(setResult, verifiedSession.result);
          safeSetState(setPhase, "done");
          return;
        }

        // Otherwise, poll for status changes until terminal state
        for await (const event of quickIdRef.current.pollStatus()) {
          if (!isMountedRef.current) return;

          if (event.type === "PROCESSING") {
            safeSetState(setPhase, "verifying");
            safeSetState(setSession, event.session);
          }

          if (event.type === "VERIFIED") {
            safeSetState(setSession, event.session);
            safeSetState(setResult, event.result);
            safeSetState(setPhase, "done");
            break;
          }

          if (event.type === "FAILED") {
            safeSetState(setSession, event.session);
            safeSetState(setError, event.error);
            safeSetState(setErrorCode, "VERIFICATION_FAILED");
            safeSetState(setPhase, "done");
            break;
          }
        }
      } catch (err) {
        handleError(err, "Failed to upload selfie or verify identity");
        safeSetState(setPhase, "done");
      } finally {
        safeSetState(setIsBusy, false);
      }
    },
    [safeSetState, handleError]
  );

  const reset = useCallback(() => {
    safeSetState(setPhase, "idle");
    safeSetState(setSession, null);
    safeSetState(setResult, null);
    safeSetState(setError, null);
    safeSetState(setErrorCode, null);
    safeSetState(setIsBusy, false);
  }, [safeSetState]);

  return {
    state: {
      phase,
      session,
      result,
      error,
      errorCode,
      isBusy,
    },
    start,
    uploadDocument,
    uploadSelfieAndVerify,
    reset,
  };
}
