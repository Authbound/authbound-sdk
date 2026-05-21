import { AuthboundClientError } from '@authbound/server';

export function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export function toErrorPayload(error: unknown): {
  error: string;
  message: string;
  details?: unknown;
} {
  if (error instanceof AuthboundClientError) {
    return {
      error: error.code,
      message: error.message,
      details: error.details,
    };
  }

  if (error instanceof Error) {
    return {
      error: 'example_error',
      message: error.message,
    };
  }

  return {
    error: 'example_error',
    message: 'Unexpected error',
  };
}

const VERIFICATION_SESSION_TTL_MS = 30 * 60 * 1000;

type VerificationSessionRecord = {
  clientToken: string;
  createdAt: number;
};

const verificationSessions = new Map<string, VerificationSessionRecord>();

export function storeVerificationSession(verificationId: string, clientToken: string): void {
  verificationSessions.set(verificationId, {
    clientToken,
    createdAt: Date.now(),
  });
  pruneVerificationSessions();
}

export function getVerificationClientToken(verificationId: string): string | undefined {
  const record = verificationSessions.get(verificationId);
  if (!record) {
    return undefined;
  }
  if (Date.now() - record.createdAt > VERIFICATION_SESSION_TTL_MS) {
    verificationSessions.delete(verificationId);
    return undefined;
  }
  return record.clientToken;
}

function pruneVerificationSessions(): void {
  const now = Date.now();
  for (const [id, record] of verificationSessions) {
    if (now - record.createdAt > VERIFICATION_SESSION_TTL_MS) {
      verificationSessions.delete(id);
    }
  }
}
