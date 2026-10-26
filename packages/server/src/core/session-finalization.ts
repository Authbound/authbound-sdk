import { selectAgeClaims } from "./age-claims";
import type { SignedVerificationResult } from "./client";

export interface VerifiedSessionFinalization {
  status: "verified";
  /** The disclosed age claims, kept so routes can check `minAge`. */
  ageClaims?: Record<string, unknown>;
}

export function toVerifiedSessionFinalization(
  result: SignedVerificationResult
): VerifiedSessionFinalization | null {
  if (result.status !== "verified") {
    return null;
  }

  const ageClaims = selectAgeClaims(result.claims);
  return {
    status: result.status,
    ...(ageClaims ? { ageClaims } : {}),
  };
}
