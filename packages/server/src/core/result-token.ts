import { errors, type JWTPayload, type JWTVerifyGetKey, jwtVerify } from "jose";

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

/**
 * Which check a result token failed.
 *
 * - `unknown_key`: no key in the key set has the token's `kid`. The token was
 *   most likely issued by another Authbound host than the one the keys come from.
 * - `keys_unavailable`: the key set could not be fetched or read.
 * - `invalid_signature`: a key matched, but the signature does not verify.
 * - `wrong_issuer`, `wrong_audience`, `wrong_subject`: `iss`, `aud` or `sub`
 *   differs from the expected value.
 * - `expired`: `exp` is in the past. Read the result again for a fresh token.
 * - `malformed`: not a compact ES256 JWT with the claims a result token carries.
 */
export type ResultTokenFailureReason =
  | "unknown_key"
  | "keys_unavailable"
  | "invalid_signature"
  | "wrong_issuer"
  | "wrong_audience"
  | "wrong_subject"
  | "expired"
  | "malformed";

export class ResultTokenVerificationError extends Error {
  readonly code = "RESULT_TOKEN_INVALID";
  readonly reason: ResultTokenFailureReason;

  constructor(
    reason: ResultTokenFailureReason,
    message: string,
    options?: { cause?: unknown }
  ) {
    super(message, options);
    this.name = "ResultTokenVerificationError";
    this.reason = reason;
  }
}

export interface VerifyResultTokenOptions {
  /** The Authbound result signing keys, for example `createRemoteJWKSet(new URL("/v1/jwks", apiUrl))`. */
  keys: JWTVerifyGetKey;
  /** The `iss` the Authbound deployment signs result tokens with. */
  issuer: string;
  /** The verification the token must be about (`sub`). Required. */
  verificationId: string;
  /**
   * Your Authbound project ID (`aud`). Optional: Authbound signs a result
   * token only for the project that owns its verification, so the required
   * `verificationId` check already pins the project.
   */
  audience?: string | undefined;
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

function requireNonEmpty(value: unknown, name: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new TypeError(
      `verifyResultToken needs ${name}: the token is only meaningful for the value you expect`
    );
  }
  return value;
}

function claimFailure(
  error: errors.JWTClaimValidationFailed,
  expected: { issuer: string; verificationId: string; audience?: string }
): ResultTokenVerificationError {
  const actual = error.payload[error.claim];
  const shown = typeof actual === "string" ? `"${actual}"` : "missing";
  switch (error.claim) {
    case "iss":
      return new ResultTokenVerificationError(
        "wrong_issuer",
        `Result token issuer is ${shown}, expected "${expected.issuer}". Set resultIssuer when your deployment signs with another issuer.`,
        { cause: error }
      );
    case "sub":
      return new ResultTokenVerificationError(
        "wrong_subject",
        `Result token is for verification ${shown}, expected "${expected.verificationId}"`,
        { cause: error }
      );
    case "aud":
      return new ResultTokenVerificationError(
        "wrong_audience",
        `Result token is for project ${shown}, expected "${expected.audience ?? ""}"`,
        { cause: error }
      );
    default:
      return new ResultTokenVerificationError(
        "malformed",
        `Result token claim ${error.claim} is invalid: ${error.message}`,
        { cause: error }
      );
  }
}

function toVerificationError(
  error: unknown,
  expected: { issuer: string; verificationId: string; audience?: string }
): ResultTokenVerificationError {
  if (error instanceof errors.JWTExpired) {
    return new ResultTokenVerificationError(
      "expired",
      "Result token has expired. Result tokens are valid for one hour from each read; call getResult() again for a fresh one.",
      { cause: error }
    );
  }
  if (error instanceof errors.JWTClaimValidationFailed) {
    return claimFailure(error, expected);
  }
  if (error instanceof errors.JWKSNoMatchingKey) {
    return new ResultTokenVerificationError(
      "unknown_key",
      "No result signing key matches this token. It was probably issued by another Authbound host than the one apiUrl points at: use the apiUrl of the host you read the result from.",
      { cause: error }
    );
  }
  if (error instanceof errors.JWSSignatureVerificationFailed) {
    return new ResultTokenVerificationError(
      "invalid_signature",
      "Result token signature is invalid",
      { cause: error }
    );
  }
  if (
    error instanceof errors.JWSInvalid ||
    error instanceof errors.JWTInvalid ||
    error instanceof errors.JOSEAlgNotAllowed
  ) {
    return new ResultTokenVerificationError(
      "malformed",
      `Result token is malformed: ${error.message}`,
      { cause: error }
    );
  }
  return new ResultTokenVerificationError(
    "keys_unavailable",
    "Could not load the result signing keys. Check that apiUrl is reachable and serves /v1/jwks.",
    { cause: error }
  );
}

/**
 * Verify a signed verification result token: an ES256 signature from one of
 * `keys`, the expected `iss` and `sub`, `aud` when given, and an unexpired
 * `exp`. Result tokens are valid for one hour from each result read.
 *
 * @throws TypeError when `issuer` or `verificationId` is missing.
 * @throws ResultTokenVerificationError when any check fails; `reason` names it.
 */
export async function verifyResultToken(
  resultToken: string,
  options: VerifyResultTokenOptions
): Promise<VerifiedResultToken> {
  const expected = {
    issuer: requireNonEmpty(options.issuer, "issuer"),
    verificationId: requireNonEmpty(options.verificationId, "verificationId"),
    ...(options.audience === undefined
      ? {}
      : { audience: requireNonEmpty(options.audience, "audience") }),
  };

  let payload: JWTPayload;
  try {
    ({ payload } = await jwtVerify(resultToken, options.keys, {
      algorithms: ["ES256"],
      // Tolerates small clock differences between the API and this server.
      clockTolerance: 5,
      issuer: expected.issuer,
      subject: expected.verificationId,
      requiredClaims: ["iss", "sub", "exp"],
      ...(expected.audience ? { audience: expected.audience } : {}),
    }));
  } catch (error) {
    throw toVerificationError(error, expected);
  }

  const claimsSha256 = payload.claims_sha256;
  if (
    !(
      (payload.status === "verified" || payload.status === "failed") &&
      (claimsSha256 === null || typeof claimsSha256 === "string")
    )
  ) {
    throw new ResultTokenVerificationError(
      "malformed",
      "Result token has no valid status or claims_sha256"
    );
  }

  const verified: VerifiedResultToken = {
    payload: payload as ResultTokenPayload,
  };
  verifiedTokens.add(verified);
  return verified;
}
