import type {
  QuickIDConfig,
  QuickIdResult,
  QuickIdSession,
} from '@authbound/quickid-core';
import type React from 'react';
import { useEffect } from 'react';
import { useQuickID } from '../useQuickID';
import { DocumentUpload } from './documentUpload';
import { SelfieCapture } from './selfieCapture';
import { Status } from './status';

export interface QuickIDFlowProps {
  config: QuickIDConfig;
  onComplete?: (session: QuickIdSession, result: QuickIdResult | null) => void;
  onError?: (error: string) => void;
  startButtonLabel?: string;
  title?: string;
  description?: string;
}

/**
 * Opinionated "wizard-style" QuickID flow:
 *  1. Start session
 *  2. Upload document
 *  3. Upload selfie
 *  4. Verify & show result
 *
 * Consumers who need more control can use the hook + smaller components directly.
 */
export const QuickIDFlow: React.FC<QuickIDFlowProps> = ({
  config,
  onComplete,
  onError,
  startButtonLabel = 'Start identity verification',
  title = 'Verify your identity',
  description = 'We will verify your identity using your document and a selfie.',
}) => {
  const {
    state: { phase, session, result, error, isBusy },
    start,
    uploadDocument,
    uploadSelfieAndVerify,
    reset,
  } = useQuickID(config);

  useEffect(() => {
    if (error && onError) {
      onError(error);
    }
  }, [error, onError]);

  useEffect(() => {
    if (phase === 'done' && session && onComplete) {
      onComplete(session, result ?? null);
    }
  }, [phase, session, result, onComplete]);

  const handleStart = async () => {
    await start();
  };

  const showStartScreen = phase === 'idle';
  const showDocScreen = phase === 'awaiting_document';
  const showSelfieScreen = phase === 'awaiting_selfie';
  const showVerifying = phase === 'verifying';
  const showDone = phase === 'done';

  return (
    <div
      style={{
        borderRadius: 12,
        border: '1px solid rgba(0,0,0,0.08)',
        padding: 20,
        maxWidth: 480,
        display: 'flex',
        flexDirection: 'column',
        gap: 16,
        background: '#fff',
      }}
    >
      <div>
        <h2
          style={{
            margin: 0,
            fontSize: 18,
            fontWeight: 600,
          }}
        >
          {title}
        </h2>
        <p
          style={{
            margin: '4px 0 0',
            fontSize: 13,
            color: '#555',
          }}
        >
          {description}
        </p>
      </div>

      {showStartScreen && (
        <>
          {error && (
            <Status
              tone="error"
              label="Something went wrong"
              description={error}
            />
          )}
          <button
            type="button"
            onClick={handleStart}
            disabled={isBusy}
            style={{
              marginTop: 8,
              alignSelf: 'flex-start',
              padding: '8px 14px',
              borderRadius: 999,
              border: 'none',
              background: '#0058cc',
              color: '#fff',
              fontSize: 14,
              fontWeight: 500,
              cursor: isBusy ? 'not-allowed' : 'pointer',
              opacity: isBusy ? 0.6 : 1,
            }}
          >
            {startButtonLabel}
          </button>
        </>
      )}

      {showDocScreen && (
        <>
          {error && (
            <Status
              tone="error"
              label="Something went wrong"
              description={error}
            />
          )}
          <DocumentUpload onUpload={uploadDocument} disabled={isBusy} />
        </>
      )}

      {showSelfieScreen && (
        <>
          {error && (
            <Status
              tone="error"
              label="Something went wrong"
              description={error}
            />
          )}
          <SelfieCapture onCapture={uploadSelfieAndVerify} disabled={isBusy} />
        </>
      )}

      {showVerifying && (
        <Status
          tone="info"
          label="Verifying your identity…"
          description="This usually takes a few seconds."
          showSpinner
        />
      )}

      {showDone && (
        <>
          {result?.verified ? (
            <Status
              tone="success"
              label="Identity verified"
              description="You can now continue to your appointment."
            />
          ) : (
            <Status
              tone="error"
              label="Verification failed"
              description={
                error ??
                'We could not verify your identity. Please check that your document and selfie are clear and try again.'
              }
            />
          )}
          <button
            type="button"
            onClick={reset}
            style={{
              marginTop: 8,
              alignSelf: 'flex-start',
              padding: '6px 12px',
              borderRadius: 999,
              border: '1px solid rgba(0,0,0,0.2)',
              background: '#fff',
              color: '#333',
              fontSize: 13,
              cursor: 'pointer',
            }}
          >
            Start over
          </button>
        </>
      )}
    </div>
  );
};
