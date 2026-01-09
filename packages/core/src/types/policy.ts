/**
 * Policy types for verification requirements.
 *
 * Policies define what credentials and claims are required for verification.
 * They use semantic versioning for audit compliance.
 */

import { z } from "zod";
import type { PolicyId } from "./branded";

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
  /** Unique policy identifier with version */
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
  id: z.custom<PolicyId>((val) =>
    typeof val === "string" && val.includes("@")
  ),
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
  /** Age verification (18+) using PID */
  AGE_GATE_18: "age-gate-18@1.0.0" as PolicyId,

  /** Age verification (21+) using PID */
  AGE_GATE_21: "age-gate-21@1.0.0" as PolicyId,

  /** Age verification (65+) for senior discounts */
  AGE_GATE_65: "age-gate-65@1.0.0" as PolicyId,

  /** Basic identity verification (name + birthdate) */
  IDENTITY_BASIC: "identity-basic@1.0.0" as PolicyId,

  /** Full identity verification (name + birthdate + nationality) */
  IDENTITY_FULL: "identity-full@1.0.0" as PolicyId,

  /** EU residency verification */
  EU_RESIDENCY: "eu-residency@1.0.0" as PolicyId,

  /** Driving license verification (valid license) */
  DRIVING_LICENSE: "driving-license@1.0.0" as PolicyId,

  /** Driving license with specific category (e.g., B) */
  DRIVING_LICENSE_B: "driving-license-b@1.0.0" as PolicyId,
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
    name: "Age Verification (18+)",
    description: "Verify the user is at least 18 years old",
    credentials: [
      {
        type: "eu.europa.ec.eudi.pid.1",
        claims: ["age_over_18"],
        purpose: "Verify you are at least 18 years old",
      },
    ],
  },
  AGE_GATE_21: {
    id: PolicyPresets.AGE_GATE_21,
    name: "Age Verification (21+)",
    description: "Verify the user is at least 21 years old",
    credentials: [
      {
        type: "eu.europa.ec.eudi.pid.1",
        claims: ["age_over_21"],
        purpose: "Verify you are at least 21 years old",
      },
    ],
  },
  AGE_GATE_65: {
    id: PolicyPresets.AGE_GATE_65,
    name: "Age Verification (65+)",
    description: "Verify the user is at least 65 years old",
    credentials: [
      {
        type: "eu.europa.ec.eudi.pid.1",
        claims: ["age_over_65"],
        purpose: "Verify you are at least 65 years old for senior discount",
      },
    ],
  },
  IDENTITY_BASIC: {
    id: PolicyPresets.IDENTITY_BASIC,
    name: "Basic Identity",
    description: "Verify basic identity information",
    credentials: [
      {
        type: "eu.europa.ec.eudi.pid.1",
        claims: ["family_name", "given_name", "birth_date"],
        purpose: "Verify your identity",
      },
    ],
  },
  IDENTITY_FULL: {
    id: PolicyPresets.IDENTITY_FULL,
    name: "Full Identity",
    description: "Verify complete identity information",
    credentials: [
      {
        type: "eu.europa.ec.eudi.pid.1",
        claims: [
          "family_name",
          "given_name",
          "birth_date",
          "nationality",
          "resident_country",
        ],
        optionalClaims: ["portrait", "resident_address"],
        purpose: "Verify your complete identity",
      },
    ],
    minAssuranceLevel: "substantial",
  },
  EU_RESIDENCY: {
    id: PolicyPresets.EU_RESIDENCY,
    name: "EU Residency",
    description: "Verify EU residency status",
    credentials: [
      {
        type: "eu.europa.ec.eudi.pid.1",
        claims: ["resident_country"],
        purpose: "Verify your EU residency",
      },
    ],
  },
  DRIVING_LICENSE: {
    id: PolicyPresets.DRIVING_LICENSE,
    name: "Driving License",
    description: "Verify valid driving license",
    credentials: [
      {
        type: "org.iso.18013.5.1.mDL",
        claims: ["family_name", "given_name", "document_number"],
        optionalClaims: ["driving_privileges"],
        purpose: "Verify your driving license",
      },
    ],
  },
  DRIVING_LICENSE_B: {
    id: PolicyPresets.DRIVING_LICENSE_B,
    name: "Driving License (Category B)",
    description: "Verify valid Category B driving license",
    credentials: [
      {
        type: "org.iso.18013.5.1.mDL",
        claims: ["family_name", "given_name", "driving_privileges"],
        purpose: "Verify your Category B driving license",
      },
    ],
  },
};
