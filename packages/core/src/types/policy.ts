/**
 * Policy types for verification requirements.
 *
 * Policies define what credentials and claims are required for verification.
 * Public presets use concrete seeded `pol_*_vN` IDs.
 */

import { z } from "zod";
import { isPolicyId, type PolicyId } from "./branded";

// ============================================================================
// Policy Configuration
// ============================================================================

/**
 * Credential requirement in a policy.
 */
export interface CredentialRequirement {
  /** Credential type (e.g., "eu.europa.ec.eudi.pid.1", "org.iso.18013.5.1.mDL") */
  type: string;
  /** Required claims from this credential */
  claims: string[];
  /** Optional claims to request if available */
  optionalClaims?: string[];
  /** Purpose for requesting these claims (shown to user) */
  purpose?: string;
}

export const CredentialRequirementSchema = z.object({
  type: z.string(),
  claims: z.array(z.string()),
  optionalClaims: z.array(z.string()).optional(),
  purpose: z.string().optional(),
});

/**
 * Policy definition.
 */
export interface Policy {
  /** Unique concrete seeded policy identifier */
  id: PolicyId;
  /** Human-readable policy name */
  name: string;
  /** Policy description */
  description?: string;
  /** Required credentials */
  credentials: CredentialRequirement[];
  /** Minimum assurance level (eIDAS LoA) */
  minAssuranceLevel?: "low" | "substantial" | "high";
  /** Content hash for audit trail */
  contentHash?: string;
  /** When this policy version was created */
  createdAt?: string;
}

export const PolicySchema = z.object({
  id: z.custom<PolicyId>((val) => typeof val === "string" && isPolicyId(val)),
  name: z.string(),
  description: z.string().optional(),
  credentials: z.array(CredentialRequirementSchema),
  minAssuranceLevel: z.enum(["low", "substantial", "high"]).optional(),
  contentHash: z.string().optional(),
  createdAt: z.string().optional(),
});

// ============================================================================
// Policy Presets
// ============================================================================

/**
 * Common policy presets for quick integration.
 */
export const PolicyPresets = {
  /** Age verification (18+) using Authbound PID */
  AGE_GATE_18: "pol_age_over_18_authbound_v1" as PolicyId,

  /** Age verification (18+) using official EUDI PID */
  AGE_GATE_18_EUDI: "pol_age_over_18_eudi_v1" as PolicyId,

  /** Basic identity verification using Authbound PID */
  IDENTITY_BASIC: "pol_identity_basic_authbound_v1" as PolicyId,

  /** Basic identity verification using official EUDI PID */
  IDENTITY_BASIC_EUDI: "pol_identity_basic_eudi_v1" as PolicyId,

  /** Basic KYC verification using Authbound PID */
  KYC_BASIC: "pol_kyc_basic_authbound_v1" as PolicyId,

  /** Basic KYC verification using official EUDI PID */
  KYC_BASIC_EUDI: "pol_kyc_basic_eudi_v1" as PolicyId,

  /** Authbound pension credential verification */
  PENSION: "pol_authbound_pension_v1" as PolicyId,
} as const;

/**
 * Preset policy definitions with credential requirements.
 */
export const PRESET_POLICIES: Record<
  keyof typeof PolicyPresets,
  Omit<Policy, "contentHash" | "createdAt">
> = {
  AGE_GATE_18: {
    id: PolicyPresets.AGE_GATE_18,
    name: "Age Verification (18+, Authbound PID)",
    description: "Verify the user is at least 18 years old using Authbound PID",
    credentials: [
      {
        type: "urn:vc:authbound:pid:1.0",
        claims: ["age_over_18"],
        purpose: "Verify you are at least 18 years old",
      },
    ],
  },
  AGE_GATE_18_EUDI: {
    id: PolicyPresets.AGE_GATE_18_EUDI,
    name: "Age Verification (18+, EUDI PID)",
    description:
      "Verify the user is at least 18 years old using official EUDI PID",
    credentials: [
      {
        type: "eu.europa.ec.eudi.pid.1",
        claims: ["age_over_18"],
        purpose: "Verify you are at least 18 years old",
      },
    ],
  },
  IDENTITY_BASIC: {
    id: PolicyPresets.IDENTITY_BASIC,
    name: "Basic Identity",
    description: "Verify Authbound PID name and birth date",
    credentials: [
      {
        type: "urn:vc:authbound:pid:1.0",
        claims: ["family_name", "given_name", "birth_date"],
        purpose: "Verify your identity",
      },
    ],
  },
  IDENTITY_BASIC_EUDI: {
    id: PolicyPresets.IDENTITY_BASIC_EUDI,
    name: "Basic Identity (EUDI PID)",
    description: "Verify official EUDI PID name and birth date",
    credentials: [
      {
        type: "eu.europa.ec.eudi.pid.1",
        claims: ["family_name", "given_name", "birth_date"],
        purpose: "Verify your identity",
      },
    ],
  },
  KYC_BASIC: {
    id: PolicyPresets.KYC_BASIC,
    name: "Basic KYC",
    description: "Verify Authbound PID name and nationality",
    credentials: [
      {
        type: "urn:vc:authbound:pid:1.0",
        claims: ["family_name", "given_name", "nationality"],
        purpose: "Verify your identity for regulatory compliance",
      },
    ],
  },
  KYC_BASIC_EUDI: {
    id: PolicyPresets.KYC_BASIC_EUDI,
    name: "Basic KYC (EUDI PID)",
    description: "Verify official EUDI PID name and nationality",
    credentials: [
      {
        type: "eu.europa.ec.eudi.pid.1",
        claims: ["family_name", "given_name", "nationality"],
        purpose: "Verify your identity for regulatory compliance",
      },
    ],
  },
  PENSION: {
    id: PolicyPresets.PENSION,
    name: "Pension Credential",
    description: "Verify an Authbound pension credential",
    credentials: [
      {
        type: "urn:vc:authbound:pension:1.0",
        claims: [
          "Person.given_name",
          "Person.family_name",
          "Pension.startDate",
        ],
        purpose: "Verify your pension credential",
      },
    ],
  },
};
