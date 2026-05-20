import {
  type AuthboundClient,
  AuthboundClientError,
  type CreateCredentialDefinitionOptions,
} from "@authbound/server";
import type { PensionCredentialFixture } from "./utils.ts";

function pensionCredentialDefinitionPayload(
  credentialDefinitionId: string
): CreateCredentialDefinitionOptions {
  return {
    credentialDefinitionId,
    vct: "urn:vc:authbound:pension:1.0",
    format: "dc+sd-jwt",
    title: "Pension Credential",
    aliases: ["pension"],
    claims: [
      {
        path: ["Person", "given_name"],
        mandatory: true,
        displayName: "Given Name",
      },
      {
        path: ["Person", "family_name"],
        mandatory: true,
        displayName: "Family Name",
      },
      {
        path: ["Person", "birth_date"],
        mandatory: true,
        displayName: "Birth Date",
      },
      {
        path: ["Person", "personal_administrative_number"],
        mandatory: true,
        displayName: "Person Identifier",
      },
      {
        path: ["Pension", "typeCode"],
        mandatory: true,
        displayName: "Type Code",
      },
      { path: ["Pension", "typeName"], mandatory: true, displayName: "Type" },
      {
        path: ["Pension", "startDate"],
        mandatory: true,
        displayName: "Start Date",
      },
      { path: ["Pension", "endDate"], displayName: "End Date" },
      { path: ["Pension", "provisional"], displayName: "Provisional" },
    ],
  };
}

// 1. Create the credential definition that declares the claim paths this credential can contain.
export async function createPensionCredentialDefinition(
  authbound: AuthboundClient,
  credentialDefinitionId: string
) {
  // Reusing the same ID keeps the example safe to run more than once.
  try {
    return await authbound.issuer.credentialDefinitions.get(
      credentialDefinitionId
    );
  } catch (error) {
    if (
      !(error instanceof AuthboundClientError) ||
      error.code !== "credential_definition_not_found"
    ) {
      throw error;
    }
  }

  return authbound.issuer.credentialDefinitions.create(
    pensionCredentialDefinitionPayload(credentialDefinitionId)
  );
}

// 2. The offer claims must match the paths registered in the definition.
export function pensionCredentialClaims(
  record: PensionCredentialFixture
): Record<string, unknown> {
  const { Person, Pension } = record.credentialSubject;

  return {
    Person: {
      given_name: Person.given_name,
      family_name: Person.family_name,
      birth_date: Person.birth_date,
      personal_administrative_number: Person.personal_administrative_number,
    },
    Pension: {
      typeCode: Pension.typeCode,
      typeName: Pension.typeName,
      startDate: Pension.startDate,
      ...(Pension.endDate ? { endDate: Pension.endDate } : {}),
      ...(Pension.provisional !== undefined
        ? { provisional: Pension.provisional }
        : {}),
    },
  };
}

export async function createPensionCredentialOffer(
  authbound: AuthboundClient,
  options: {
    credentialDefinitionId: string;
    credential: PensionCredentialFixture;
  }
) {
  // InTime issuance supplies the credential data when the wallet offer is made.
  const definition = await createPensionCredentialDefinition(
    authbound,
    options.credentialDefinitionId
  );

  return authbound.openId4Vc.issuance.createOffer({
    credentialDefinitionId: definition.credentialDefinitionId,
    claims: pensionCredentialClaims(options.credential),
    issuanceMode: "InTime",
  });
}

// 3. The verifier asks an EUDI wallet for a credential matching the pension policy.
export async function createPensionVerificationRequest(
  authbound: AuthboundClient,
  options: {
    policyId: string;
  }
) {
  return authbound.verifications.create({
    policyId: options.policyId,
    provider: "eudi",
  });
}

export async function getPensionVerificationStatus(
  authbound: AuthboundClient,
  options: {
    verificationId: string;
    clientToken: string;
    publishableKey: string;
  }
) {
  // clientToken is returned only when the verification is created.
  // Pair it with the publishable key for status polling, never the secret key.
  return authbound.verifications.getStatus(options.verificationId, {
    clientToken: options.clientToken,
    publishableKey: options.publishableKey,
  });
}

export async function getPensionVerificationResult(
  authbound: AuthboundClient,
  options: {
    verificationId: string;
  }
) {
  // Fetch the signed result with the server secret key.
  // This demo calls it only after status polling reports verified.
  return authbound.verifications.getResult(options.verificationId);
}
