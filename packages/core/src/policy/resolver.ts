/**
 * Policy version resolution.
 *
 * Policies use semantic versioning for audit compliance.
 * In production, exact versions must be specified.
 */

import type { PolicyId } from "../types/branded";
import { isPolicyId, parsePolicyId } from "../types/branded";
import { AuthboundError } from "../types/errors";

// ============================================================================
// Version Parsing
// ============================================================================

/**
 * Parsed semantic version.
 */
export interface SemVer {
  major: number;
  minor: number;
  patch: number;
  prerelease?: string;
  build?: string;
}

/**
 * Parse a semantic version string.
 */
export function parseSemVer(version: string): SemVer | null {
  // Remove leading 'v' if present
  const clean = version.startsWith("v") ? version.slice(1) : version;

  // Full semver regex
  const match = clean.match(
    /^(\d+)\.(\d+)\.(\d+)(?:-([a-zA-Z0-9.-]+))?(?:\+([a-zA-Z0-9.-]+))?$/
  );

  if (!match) return null;

  return {
    major: parseInt(match[1], 10),
    minor: parseInt(match[2], 10),
    patch: parseInt(match[3], 10),
    prerelease: match[4],
    build: match[5],
  };
}

/**
 * Compare two semantic versions.
 *
 * Returns:
 * - Negative if a < b
 * - Zero if a === b
 * - Positive if a > b
 */
export function compareSemVer(a: SemVer, b: SemVer): number {
  // Compare major
  if (a.major !== b.major) return a.major - b.major;

  // Compare minor
  if (a.minor !== b.minor) return a.minor - b.minor;

  // Compare patch
  if (a.patch !== b.patch) return a.patch - b.patch;

  // Prerelease versions have lower precedence
  if (a.prerelease && !b.prerelease) return -1;
  if (!a.prerelease && b.prerelease) return 1;

  // Compare prerelease strings lexically
  if (a.prerelease && b.prerelease) {
    return a.prerelease.localeCompare(b.prerelease);
  }

  return 0;
}

/**
 * Format a SemVer back to string.
 */
export function formatSemVer(version: SemVer): string {
  let result = `${version.major}.${version.minor}.${version.patch}`;
  if (version.prerelease) result += `-${version.prerelease}`;
  if (version.build) result += `+${version.build}`;
  return result;
}

// ============================================================================
// Policy Resolution
// ============================================================================

/**
 * Resolution context for policy lookup.
 */
export interface ResolutionContext {
  /** Environment (affects version requirements) */
  environment: "live" | "test";
  /** Available policy versions (from API or cache) */
  availableVersions?: string[];
  /** Enable strict mode (require exact version in production) */
  strict?: boolean;
}

/**
 * Resolve a policy identifier to a full PolicyId with version.
 *
 * @example
 * ```ts
 * // In development, bare IDs resolve to latest
 * resolvePolicy('age-gate-18', { environment: 'test' });
 * // Returns: 'age-gate-18@1.0.0' (latest available)
 *
 * // In production, bare IDs throw
 * resolvePolicy('age-gate-18', { environment: 'live' });
 * // Throws: AuthboundError('policy_version_required')
 * ```
 */
export function resolvePolicy(
  policyIdOrName: string,
  context: ResolutionContext
): PolicyId {
  // If it's already a full PolicyId, validate and return
  if (isPolicyId(policyIdOrName)) {
    const { name, version } = parsePolicyId(policyIdOrName);

    // Validate version format
    const parsed = parseSemVer(version);
    if (!parsed) {
      throw new AuthboundError("policy_invalid", `Invalid version format: ${version}`);
    }

    // If available versions provided, check it exists
    if (context.availableVersions && !context.availableVersions.includes(version)) {
      throw new AuthboundError(
        "policy_not_found",
        `Policy version ${policyIdOrName} not found. Available: ${context.availableVersions.join(", ")}`
      );
    }

    return policyIdOrName;
  }

  // Bare policy name - need to resolve version
  const policyName = policyIdOrName;

  // In strict mode (production), require explicit version
  if (context.strict !== false && context.environment === "live") {
    throw new AuthboundError(
      "policy_version_required",
      `Policy version required in production. Use format: ${policyName}@1.0.0`
    );
  }

  // If we have available versions, pick the latest
  if (context.availableVersions && context.availableVersions.length > 0) {
    const latest = findLatestVersion(context.availableVersions);
    return `${policyName}@${latest}` as PolicyId;
  }

  // Default to 1.0.0 for development
  if (context.environment === "test") {
    return `${policyName}@1.0.0` as PolicyId;
  }

  throw new AuthboundError(
    "policy_not_found",
    `Cannot resolve policy "${policyName}". Specify version explicitly.`
  );
}

/**
 * Find the latest version from a list of version strings.
 */
export function findLatestVersion(versions: string[]): string {
  if (versions.length === 0) {
    throw new AuthboundError("policy_not_found", "No versions available");
  }

  const parsed = versions
    .map((v) => ({ original: v, parsed: parseSemVer(v) }))
    .filter((v) => v.parsed !== null) as Array<{
    original: string;
    parsed: SemVer;
  }>;

  if (parsed.length === 0) {
    throw new AuthboundError("policy_invalid", "No valid versions found");
  }

  // Sort descending and take first
  parsed.sort((a, b) => compareSemVer(b.parsed, a.parsed));

  return parsed[0].original;
}

/**
 * Check if a version matches a range specification.
 *
 * Supports:
 * - Exact: "1.0.0"
 * - Caret: "^1.0.0" (compatible with 1.x.x)
 * - Tilde: "~1.0.0" (compatible with 1.0.x)
 * - Greater: ">1.0.0", ">=1.0.0"
 * - Less: "<1.0.0", "<=1.0.0"
 */
export function matchesVersionRange(
  version: string,
  range: string
): boolean {
  const parsed = parseSemVer(version);
  if (!parsed) return false;

  // Caret range (^1.0.0 matches >=1.0.0 <2.0.0)
  if (range.startsWith("^")) {
    const rangeParsed = parseSemVer(range.slice(1));
    if (!rangeParsed) return false;

    return (
      parsed.major === rangeParsed.major &&
      compareSemVer(parsed, rangeParsed) >= 0
    );
  }

  // Tilde range (~1.0.0 matches >=1.0.0 <1.1.0)
  if (range.startsWith("~")) {
    const rangeParsed = parseSemVer(range.slice(1));
    if (!rangeParsed) return false;

    return (
      parsed.major === rangeParsed.major &&
      parsed.minor === rangeParsed.minor &&
      compareSemVer(parsed, rangeParsed) >= 0
    );
  }

  // Greater than
  if (range.startsWith(">=")) {
    const rangeParsed = parseSemVer(range.slice(2));
    if (!rangeParsed) return false;
    return compareSemVer(parsed, rangeParsed) >= 0;
  }

  if (range.startsWith(">")) {
    const rangeParsed = parseSemVer(range.slice(1));
    if (!rangeParsed) return false;
    return compareSemVer(parsed, rangeParsed) > 0;
  }

  // Less than
  if (range.startsWith("<=")) {
    const rangeParsed = parseSemVer(range.slice(2));
    if (!rangeParsed) return false;
    return compareSemVer(parsed, rangeParsed) <= 0;
  }

  if (range.startsWith("<")) {
    const rangeParsed = parseSemVer(range.slice(1));
    if (!rangeParsed) return false;
    return compareSemVer(parsed, rangeParsed) < 0;
  }

  // Exact match
  const rangeParsed = parseSemVer(range);
  if (!rangeParsed) return false;
  return compareSemVer(parsed, rangeParsed) === 0;
}
