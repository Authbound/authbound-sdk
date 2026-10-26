import { type JWTPayload, type JWTVerifyGetKey, jwtVerify } from "jose";

/** The claims of a signed verification result token. */
export interface ResultTokenPayload extends JWTPayload {
  iss: string;
  sub: string;
  exp: number;
  status: "verified" | "failed";
  /** SHA-256 of the RFC 8785 JSON `{"claims": claims, "salt": claims_salt}`; null when no claims were returned. */
  claims_sha256: string | null;
}

/** A result token whose signature, issuer, subject and expiry were checked by `verifyResultToken`. */
export interface VerifiedResultToken {
  readonly payload: ResultTokenPayload;
}

export class ResultTokenVerificationError extends Error {
  readonly code = "RESULT_TOKEN_INVALID";

  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "ResultTokenVerificationError";
  }
}

export interface VerifyResultTokenOptions {
  /** The Authbound result signing keys, for example `createRemoteJWKSet(new URL("/v1/jwks", apiUrl))`. */
  keys: JWTVerifyGetKey;
  /** The `iss` the Authbound deployment signs result tokens with. */
  issuer: string;
  /** The verification the token must be about (`sub`). */
  verificationId: string;
  /** Your Authbound project ID, when you want `aud` checked too. */
  audience?: string;
}

const verifiedTokens = new WeakSet<VerifiedResultToken>();

/** True only for objects `verifyResultToken` returned. */
export function isVerifiedResultToken(
  value: unknown
): value is VerifiedResultToken {
  return (
    typeof value === "object" &&
    value !== null &&
    verifiedTokens.has(value as VerifiedResultToken)
  );
}

/**
 * Verify a signed verification result token: an ES256 signature from one of
 * `keys`, the expected `iss` and `sub`, `aud` when given, and an unexpired
 * `exp`. Result tokens are valid for one hour from each result read.
 *
 * @throws ResultTokenVerificationError when any check fails.
 */
export async function verifyResultToken(
  resultToken: string,
  options: VerifyResultTokenOptions
): Promise<VerifiedResultToken> {
  let payload: JWTPayload;
  try {
    ({ payload } = await jwtVerify(resultToken, options.keys, {
      algorithms: ["ES256"],
      issuer: options.issuer,
      subject: options.verificationId,
      requiredClaims: ["iss", "sub", "exp"],
      ...(options.audience ? { audience: options.audience } : {}),
    }));
  } catch (error) {
    throw new ResultTokenVerificationError("Result token verification failed", {
      cause: error,
    });
  }

  const claimsSha256 = payload.claims_sha256;
  if (
    !(
      (payload.status === "verified" || payload.status === "failed") &&
      (claimsSha256 === null || typeof claimsSha256 === "string")
    )
  ) {
    throw new ResultTokenVerificationError(
      "Result token has no valid status or claims_sha256"
    );
  }

  const verified: VerifiedResultToken = {
    payload: payload as ResultTokenPayload,
  };
  verifiedTokens.add(verified);
  return verified;
}
