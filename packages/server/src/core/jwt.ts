import type {
  AssuranceLevel,
  AuthboundClaims,
  AuthboundSession,
  VerificationStatus,
} from "@authbound-sdk/core";
import * as jose from "jose";

// ============================================================================
// Constants
// ============================================================================

const ALG = "dir";
const ENC = "A256GCM";
const DEFAULT_EXPIRY = "7d";

// ============================================================================
// Key Derivation
// ============================================================================

/**
 * Derive an encryption key from the secret string.
 * Uses HKDF to derive a proper 256-bit key for AES-256-GCM.
 */
async function deriveKey(secret: string): Promise<Uint8Array> {
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    "HKDF",
    false,
    ["deriveBits"]
  );

  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: encoder.encode("authbound-jwt-key"),
      info: encoder.encode("authbound"),
    },
    keyMaterial,
    256
  );

  return new Uint8Array(derivedBits);
}

// ============================================================================
// JWT Operations
// ============================================================================

export interface CreateTokenOptions {
  /** Secret key for encryption */
  secret: string;
  /** Customer user reference */
  userRef: string;
  /** Session ID from Authbound */
  sessionId: string;
  /** Verification status */
  status: VerificationStatus;
  /** Assurance level */
  assuranceLevel: AssuranceLevel;
  /** User's age (optional) */
  age?: number;
  /** Date of birth (optional) */
  dateOfBirth?: string;
  /** Token expiry (default: "7d") */
  expiresIn?: string | number;
}

/**
 * Create an encrypted JWT token containing the verification claims.
 * Uses JWE with direct encryption (A256GCM) for edge compatibility.
 */
export async function createToken(
  options: CreateTokenOptions
): Promise<string> {
  const {
    secret,
    userRef,
    sessionId,
    status,
    assuranceLevel,
    age,
    dateOfBirth,
    expiresIn = DEFAULT_EXPIRY,
  } = options;

  const key = await deriveKey(secret);

  const now = Math.floor(Date.now() / 1000);
  const expiry =
    typeof expiresIn === "number"
      ? now + expiresIn
      : now + parseExpiry(expiresIn);

  const claims: Omit<AuthboundClaims, "iat" | "exp"> = {
    sub: userRef,
    sid: sessionId,
    status,
    assurance: assuranceLevel,
    ...(age !== undefined && { age }),
    ...(dateOfBirth && { dateOfBirth }),
  };

  const token = await new jose.EncryptJWT(claims as jose.JWTPayload)
    .setProtectedHeader({ alg: ALG, enc: ENC })
    .setIssuedAt(now)
    .setExpirationTime(expiry)
    .encrypt(key);

  return token;
}

/**
 * Verify and decrypt a JWT token, returning the claims.
 * Returns null if the token is invalid or expired.
 */
export async function verifyToken(
  token: string,
  secret: string
): Promise<AuthboundClaims | null> {
  try {
    const key = await deriveKey(secret);
    const { payload } = await jose.jwtDecrypt(token, key);

    // Validate required fields
    if (
      typeof payload.sub !== "string" ||
      typeof payload.sid !== "string" ||
      typeof payload.status !== "string" ||
      typeof payload.assurance !== "string" ||
      typeof payload.iat !== "number" ||
      typeof payload.exp !== "number"
    ) {
      return null;
    }

    return {
      sub: payload.sub,
      sid: payload.sid as string,
      status: payload.status as VerificationStatus,
      assurance: payload.assurance as AssuranceLevel,
      age: typeof payload.age === "number" ? payload.age : undefined,
      dateOfBirth:
        typeof payload.dateOfBirth === "string"
          ? payload.dateOfBirth
          : undefined,
      iat: payload.iat,
      exp: payload.exp,
    };
  } catch {
    // Token is invalid, expired, or tampered with
    return null;
  }
}

/**
 * Convert JWT claims to a user-friendly session object.
 */
export function claimsToSession(claims: AuthboundClaims): AuthboundSession {
  return {
    isVerified: claims.status === "VERIFIED",
    status: claims.status,
    assuranceLevel: claims.assurance,
    age: claims.age,
    sessionId: claims.sid,
    userRef: claims.sub,
    dateOfBirth: claims.dateOfBirth,
    expiresAt: new Date(claims.exp * 1000),
  };
}

/**
 * Get session from a token string.
 * Returns null if the token is invalid or expired.
 */
export async function getSessionFromToken(
  token: string,
  secret: string
): Promise<AuthboundSession | null> {
  const claims = await verifyToken(token, secret);
  if (!claims) return null;
  return claimsToSession(claims);
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Parse expiry string like "7d", "1h", "30m" to seconds.
 */
function parseExpiry(expiry: string): number {
  const match = expiry.match(/^(\d+)([smhd])$/);
  if (!match) {
    throw new Error(
      `Invalid expiry format: ${expiry}. Use format like "7d", "1h", "30m"`
    );
  }

  const value = Number.parseInt(match[1], 10);
  const unit = match[2];

  switch (unit) {
    case "s":
      return value;
    case "m":
      return value * 60;
    case "h":
      return value * 60 * 60;
    case "d":
      return value * 60 * 60 * 24;
    default:
      throw new Error(`Unknown time unit: ${unit}`);
  }
}

/**
 * Check if a token is expired without full verification.
 * Useful for quick checks before attempting full verification.
 */
export async function isTokenExpired(
  token: string,
  secret: string
): Promise<boolean> {
  const claims = await verifyToken(token, secret);
  if (!claims) return true;
  return claims.exp * 1000 < Date.now();
}

/**
 * Refresh a token with updated expiry.
 * Preserves all existing claims.
 */
export async function refreshToken(
  token: string,
  secret: string,
  expiresIn: string | number = DEFAULT_EXPIRY
): Promise<string | null> {
  const claims = await verifyToken(token, secret);
  if (!claims) return null;

  return createToken({
    secret,
    userRef: claims.sub,
    sessionId: claims.sid,
    status: claims.status,
    assuranceLevel: claims.assurance,
    age: claims.age,
    dateOfBirth: claims.dateOfBirth,
    expiresIn,
  });
}
