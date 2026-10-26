import {
  isVerifiedResultToken,
  type VerifiedResultToken,
} from "./result-token";

// In a `u` regex a surrogate pair is one code point, so only unpaired halves match.
const LONE_SURROGATE = /[\uD800-\uDFFF]/u;

/**
 * RFC 8785 (JCS) serialization. ECMAScript number and string serialization is
 * what JCS specifies, so only key order, and values JSON cannot represent,
 * need handling here.
 */
function canonicalJson(value: unknown): string {
  if (value === null || typeof value === "boolean") {
    return JSON.stringify(value);
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new TypeError("JCS cannot serialize a non-finite number");
    }
    return JSON.stringify(value);
  }
  if (typeof value === "string") {
    if (LONE_SURROGATE.test(value)) {
      throw new TypeError("JCS cannot serialize a lone surrogate");
    }
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(",")}]`;
  }
  if (typeof value === "object") {
    // Default sort order is by UTF-16 code units, as RFC 8785 section 3.2.3 requires.
    const members = Object.keys(value)
      .sort()
      .map(
        (key) =>
          `${canonicalJson(key)}:${canonicalJson((value as Record<string, unknown>)[key])}`
      );
    return `{${members.join(",")}}`;
  }
  throw new TypeError(`JCS cannot serialize a value of type ${typeof value}`);
}

async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(input)
  );
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0")
  ).join("");
}

/**
 * Check that `claims` and `claimsSalt` from a verification result are the
 * ones a verified result token commits to: its `claims_sha256` must equal the
 * SHA-256 of the RFC 8785 canonical JSON `{"claims": claims, "salt": claimsSalt}`.
 *
 * Pass the token `verifyResultToken` (or `client.verifications.verifyResultToken`)
 * returned, so the digest comes from a token whose signature was checked. A
 * match then proves the claims are the ones Authbound signed for, also when
 * you stored them or received them from someone else.
 *
 * @throws TypeError when `resultToken` was not returned by `verifyResultToken`,
 *   or when the claims contain a value JSON cannot represent.
 */
export async function verifyClaimsDigest(
  claims: Record<string, unknown>,
  claimsSalt: string,
  resultToken: VerifiedResultToken
): Promise<boolean> {
  if (!isVerifiedResultToken(resultToken)) {
    throw new TypeError(
      "verifyClaimsDigest needs a token from verifyResultToken"
    );
  }
  const expected = resultToken.payload.claims_sha256;
  const actual = await sha256Hex(canonicalJson({ claims, salt: claimsSalt }));
  return expected !== null && expected === actual;
}
