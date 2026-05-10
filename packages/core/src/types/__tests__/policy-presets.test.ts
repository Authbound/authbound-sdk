import { describe, expect, it } from "vitest";
import { fetchPresetRegistry, getPresetPolicyId } from "../../policy/registry";
import { PolicyPresets, PolicySchema, PRESET_POLICIES } from "../policy";

describe("PolicyPresets", () => {
  it("exports concrete MVP policy IDs", () => {
    expect(PolicyPresets).toEqual({
      AGE_GATE_18: "pol_age_over_18_authbound_v1",
      AGE_GATE_18_EUDI: "pol_age_over_18_eudi_v1",
      IDENTITY_BASIC: "pol_identity_basic_authbound_v1",
      IDENTITY_BASIC_EUDI: "pol_identity_basic_eudi_v1",
      KYC_BASIC: "pol_kyc_basic_authbound_v1",
      KYC_BASIC_EUDI: "pol_kyc_basic_eudi_v1",
      PENSION: "pol_authbound_pension_v1",
    });
  });

  it("keeps bundled presets limited to supported MVP policies", () => {
    expect(Object.keys(PRESET_POLICIES).sort()).toEqual([
      "AGE_GATE_18",
      "AGE_GATE_18_EUDI",
      "IDENTITY_BASIC",
      "IDENTITY_BASIC_EUDI",
      "KYC_BASIC",
      "KYC_BASIC_EUDI",
      "PENSION",
    ]);
  });

  it("validates concrete preset policies with PolicySchema", () => {
    for (const policy of Object.values(PRESET_POLICIES)) {
      expect(() => PolicySchema.parse(policy)).not.toThrow();
    }
  });

  it("fails closed when the API preset registry cannot be fetched", async () => {
    await expect(
      fetchPresetRegistry("https://api.authbound.test", {
        fetch: async () => {
          throw new Error("offline");
        },
        forceRefresh: true,
      })
    ).rejects.toThrow("offline");
  });

  it("maps supported preset keys and slugs to concrete policy IDs", () => {
    expect(getPresetPolicyId("IDENTITY_BASIC")).toBe(
      "pol_identity_basic_authbound_v1"
    );
    expect(getPresetPolicyId("identity_basic")).toBe(
      "pol_identity_basic_authbound_v1"
    );
    expect(getPresetPolicyId("kyc_basic_eudi")).toBe(
      "pol_kyc_basic_eudi_v1"
    );
  });

  it("does not treat unknown preset slugs as policy IDs", () => {
    expect(() => getPresetPolicyId("kyc-full")).toThrow(/Unknown policy preset/);
    expect(() => getPresetPolicyId("identity-basic@1.0.0")).toThrow(
      /Unknown policy preset/
    );
  });
});
