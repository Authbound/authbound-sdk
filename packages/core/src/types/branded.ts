/**
 * Branded types for type-safe identifiers.
 *
 * Uses nominal branding to ensure type safety at compile-time.
 * This prevents accidentally passing a session ID where a policy ID is expected,
 * even if both are strings with similar formats.
 *
 * @example
 * ```ts
 * import { asPolicyId, asSessionId, type PolicyId, type SessionId } from '@authbound/core';
 *
 * const policyId = asPolicyId('age-gate-18@1.0.0');  // Creates PolicyId
 * const sessionId = asSessionId('ses_abc123');        // Creates SessionId
 *
 * // This would cause a type error:
 * // const bad: PolicyId = sessionId;  // Error: SessionId is not assignable to PolicyId
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
 * Policy ID with semantic version.
 * Format: `{name}@{semver}` (e.g., "age-gate-18@1.0.0")
 *
 * The version component follows semantic versioning:
 * - MAJOR: Breaking policy changes
 * - MINOR: New optional requirements
 * - PATCH: Bug fixes, clarifications
 *
 * Use `asPolicyId()` to create a PolicyId from a string.
 */
export type PolicyId = Brand<string, "PolicyId">;

/**
 * Check if a string is a valid PolicyId format.
 */
export function isPolicyId(value: string): value is PolicyId {
  const parts = value.split("@");
  if (parts.length !== 2) return false;

  const [name, version] = parts;
  if (!(name && version)) return false;

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
      `Invalid policy ID format: "${value}". Expected format: "name@version" (e.g., "age-gate-18@1.0.0")`
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
// Session Identifiers
// ============================================================================

/**
 * Verification session ID.
 * Format: `ses_{ulid}` (e.g., "ses_01HX7Y8K3M...")
 *
 * Use `asSessionId()` to create a SessionId from a string.
 */
export type SessionId = Brand<string, "SessionId">;

/**
 * Check if a string is a valid SessionId format.
 *
 * Validates that the session ID:
 * - Starts with "ses_" prefix
 * - Contains only alphanumeric characters, underscores, and hyphens after the prefix
 * - Has at least one character after the prefix
 *
 * This strict validation prevents path traversal attacks where malicious IDs
 * like "ses_../admin/status" could be used to access unintended endpoints.
 */
export function isSessionId(value: string): value is SessionId {
  // Strict pattern: prefix + alphanumeric/underscore/hyphen only
  // Prevents path traversal (../), query injection (?), and other special chars
  return /^ses_[a-zA-Z0-9_-]+$/.test(value);
}

/**
 * Create a branded SessionId from a string.
 * Validates format before casting.
 *
 * @throws TypeError if the string is not a valid session ID format
 */
export function asSessionId(value: string): SessionId {
  if (!isSessionId(value)) {
    throw new TypeError(
      `Invalid session ID format: "${value}". Expected format: "ses_" followed by alphanumeric characters, underscores, or hyphens (e.g., "ses_01HX7Y8K3M...")`
    );
  }
  return value as SessionId;
}

/**
 * Create a branded SessionId without validation.
 * Use only when you're certain the string is valid.
 * @internal
 */
export function unsafeAsSessionId(value: string): SessionId {
  return value as SessionId;
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
 */
export function isPublishableKey(value: string): value is PublishableKey {
  return /^pk_(live|test)_[a-zA-Z0-9]+$/.test(value);
}

/**
 * Check if a string is a valid SecretKey format.
 */
export function isSecretKey(value: string): value is SecretKey {
  return /^sk_(live|test)_[a-zA-Z0-9]+$/.test(value);
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
