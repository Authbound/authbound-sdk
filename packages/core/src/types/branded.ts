/**
 * Branded types for type-safe identifiers.
 *
 * Uses nominal branding to ensure type safety at compile-time.
 * This prevents accidentally passing a verification ID where a policy ID is expected,
 * even if both are strings with similar formats.
 *
 * @example
 * ```ts
 * import { asPolicyId, asVerificationId, type PolicyId, type VerificationId } from '@authbound-sdk/core';
 *
 * const policyId = asPolicyId('pol_authbound_pension_v1'); // Creates PolicyId
 * const verificationId = asVerificationId('vrf_abc123');    // Creates VerificationId
 *
 * // This would cause a type error:
 * // const bad: PolicyId = verificationId;  // Error: VerificationId is not assignable to PolicyId
 * ```
 */

// ============================================================================
// Brand Utility
// ============================================================================

/**
 * Unique symbol used for nominal branding.
 * @internal
 */
declare const __brand: unique symbol;

/**
 * Brand type utility for nominal typing.
 * Creates a type that is structurally compatible with T but nominally distinct.
 *
 * @typeParam T - The base type
 * @typeParam B - The brand identifier (used as a unique marker)
 */
export type Brand<T, B extends string> = T & { readonly [__brand]: B };

// ============================================================================
// Policy Identifiers
// ============================================================================

/**
 * Policy ID.
 *
 * Supports Authbound seeded IDs like `pol_authbound_pension_v1` and semantic
 * IDs like `age-gate-18@1.0.0`.
 *
 * Use `asPolicyId()` to create a PolicyId from a string.
 */
export type PolicyId = Brand<string, "PolicyId">;

/**
 * Check if a string is a valid PolicyId format.
 */
export function isPolicyId(value: string): value is PolicyId {
  if (!value || /[/?#\\\s]/.test(value)) {
    return false;
  }

  const unversionedPattern = /^[a-zA-Z0-9_-]+$/;
  if (!value.includes("@")) {
    return unversionedPattern.test(value);
  }

  const parts = value.split("@");
  if (parts.length !== 2) return false;

  const [name, version] = parts;
  if (!(name && version)) return false;
  if (!unversionedPattern.test(name)) return false;

  // Basic semver validation (allows v prefix)
  const semverPattern = /^v?\d+\.\d+\.\d+(?:-[\w.]+)?(?:\+[\w.]+)?$/;
  return semverPattern.test(version);
}

/**
 * Create a branded PolicyId from a string.
 * Validates format before casting.
 *
 * @throws TypeError if the string is not a valid policy ID format
 */
export function asPolicyId(value: string): PolicyId {
  if (!isPolicyId(value)) {
    throw new TypeError(
      `Invalid policy ID format: "${value}". Expected an Authbound policy ID (e.g., "pol_authbound_pension_v1") or "name@version" (e.g., "age-gate-18@1.0.0")`
    );
  }
  return value as PolicyId;
}

/**
 * Create a branded PolicyId without validation.
 * Use only when you're certain the string is valid.
 * @internal
 */
export function unsafeAsPolicyId(value: string): PolicyId {
  return value as PolicyId;
}

/**
 * Parse a PolicyId into its components.
 */
export function parsePolicyId(policyId: PolicyId): {
  name: string;
  version: string;
} {
  const [name, version] = (policyId as string).split("@") as [string, string];
  return { name, version };
}

// ============================================================================
// Verification Identifiers
// ============================================================================

/**
 * Verification ID.
 * Format: `vrf_{id}` or UUID.
 *
 * Use `asVerificationId()` to create a VerificationId from a string.
 */
export type VerificationId = Brand<string, "VerificationId">;

/**
 * Check if a string is a valid VerificationId format.
 *
 * Validates that the verification ID:
 * - Starts with "vrf_" or is a UUID
 * - Contains only alphanumeric characters, underscores, and hyphens after the prefix
 * - Has at least one character after the prefix
 *
 * This strict validation prevents path traversal attacks where malicious IDs
 * like "vrf_../admin/status" could be used to access unintended endpoints.
 */
export function isVerificationId(value: string): value is VerificationId {
  const uuidPattern =
    /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$/;
  return /^vrf_[a-zA-Z0-9_-]+$/.test(value) || uuidPattern.test(value);
}

/**
 * Create a branded VerificationId from a string.
 * Validates format before casting.
 *
 * @throws TypeError if the string is not a valid verification ID format
 */
export function asVerificationId(value: string): VerificationId {
  if (!isVerificationId(value)) {
    throw new TypeError(
      `Invalid verification ID format: "${value}". Expected "vrf_" followed by alphanumeric characters, underscores, or hyphens, or a UUID.`
    );
  }
  return value as VerificationId;
}

/**
 * Create a branded VerificationId without validation.
 * Use only when you're certain the string is valid.
 * @internal
 */
export function unsafeAsVerificationId(value: string): VerificationId {
  return value as VerificationId;
}

// ============================================================================
// API Keys
// ============================================================================

/**
 * Publishable key for client-side SDK initialization.
 * Format: `pk_{env}_{id}` where env is 'live' or 'test'
 *
 * Safe to expose in browser code.
 *
 * Use `asPublishableKey()` to create from a string.
 */
export type PublishableKey = Brand<string, "PublishableKey">;

/**
 * Secret key for server-side operations.
 * Format: `sk_{env}_{id}` where env is 'live' or 'test'
 *
 * NEVER expose in client code.
 *
 * Use `asSecretKey()` to create from a string.
 */
export type SecretKey = Brand<string, "SecretKey">;

/**
 * Check if a string is a valid PublishableKey format.
 * Allows base64url characters (alphanumeric, hyphen, underscore) after the prefix.
 */
export function isPublishableKey(value: string): value is PublishableKey {
  return /^pk_(live|test)_[a-zA-Z0-9_-]+$/.test(value);
}

/**
 * Check if a string is a valid SecretKey format.
 * Allows base64url characters (alphanumeric, hyphen, underscore) after the prefix.
 */
export function isSecretKey(value: string): value is SecretKey {
  return /^sk_(live|test)_[a-zA-Z0-9_-]+$/.test(value);
}

/**
 * Create a branded PublishableKey from a string.
 * Validates format before casting.
 *
 * @throws TypeError if the string is not a valid publishable key format
 */
export function asPublishableKey(value: string): PublishableKey {
  if (!isPublishableKey(value)) {
    throw new TypeError(
      `Invalid publishable key format: "${value}". Expected format: "pk_live_..." or "pk_test_..."`
    );
  }
  return value as PublishableKey;
}

/**
 * Create a branded PublishableKey without validation.
 * Use only when you're certain the string is valid.
 * @internal
 */
export function unsafeAsPublishableKey(value: string): PublishableKey {
  return value as PublishableKey;
}

/**
 * Create a branded SecretKey from a string.
 * Validates format before casting.
 *
 * @throws TypeError if the string is not a valid secret key format
 */
export function asSecretKey(value: string): SecretKey {
  if (!isSecretKey(value)) {
    throw new TypeError(
      `Invalid secret key format: "${value}". Expected format: "sk_live_..." or "sk_test_..."`
    );
  }
  return value as SecretKey;
}

/**
 * Create a branded SecretKey without validation.
 * Use only when you're certain the string is valid.
 * @internal
 */
export function unsafeAsSecretKey(value: string): SecretKey {
  return value as SecretKey;
}

/**
 * Extract environment from a key.
 */
export function getKeyEnvironment(
  key: PublishableKey | SecretKey
): "live" | "test" {
  return (key as string).includes("_live_") ? "live" : "test";
}

// ============================================================================
// Client Token
// ============================================================================

/**
 * Short-lived token for client-side session operations.
 * This is a JWT with limited scope, safe for browser use.
 *
 * Use `asClientToken()` to create from a string.
 */
export type ClientToken = Brand<string, "ClientToken">;

/**
 * Create a branded ClientToken from a string.
 */
export function asClientToken(token: string): ClientToken {
  return token as ClientToken;
}
