/**
 * Policy resolution.
 *
 * Public SDK presets now use concrete Authbound policy IDs such as
 * `pol_identity_basic_authbound_v1`.
 */

import type { PolicyId } from "../types/branded";
import { isPolicyId } from "../types/branded";
import { AuthboundError } from "../types/errors";

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
 * Resolve and validate a concrete policy identifier.
 *
 * @example
 * ```ts
 * resolvePolicy('pol_identity_basic_authbound_v1', { environment: 'test' });
 * // Returns: 'pol_identity_basic_authbound_v1'
 * ```
 */
export function resolvePolicy(
  policyIdOrName: string,
  _context: ResolutionContext
): PolicyId {
  if (isPolicyId(policyIdOrName)) {
    return policyIdOrName as PolicyId;
  }

  throw new AuthboundError(
    "policy_invalid",
    `Invalid policy ID: ${policyIdOrName}. Use a concrete Authbound policy ID.`
  );
}
