import type {
  AuthboundClient,
  CreateCredentialDefinitionOptions,
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
      { path: ["Pension", "@language"], displayName: "Language" },
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

function isCredentialDefinitionNotFound(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "credential_definition_not_found"
  );
}

export async function createPensionCredentialDefinition(
  authboundClient: AuthboundClient,
  credentialDefinitionId: string
) {
  try {
    return await authboundClient.issuer.credentialDefinitions.get(
      credentialDefinitionId
    );
  } catch (error) {
    if (!isCredentialDefinitionNotFound(error)) {
      throw error;
    }
  }

  return authboundClient.issuer.credentialDefinitions.create(
    pensionCredentialDefinitionPayload(credentialDefinitionId)
  );
}

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
      ...(Pension["@language"] ? { "@language": Pension["@language"] } : {}),
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
  authboundClient: AuthboundClient,
  options: {
    credentialDefinitionId: string;
    credential: PensionCredentialFixture;
  }
) {
  const definition = await createPensionCredentialDefinition(
    authboundClient,
    options.credentialDefinitionId
  );

  return authboundClient.openId4Vc.issuance.createOffer({
    credentialDefinitionId: definition.credentialDefinitionId,
    claims: pensionCredentialClaims(options.credential),
    issuanceMode: "InTime",
  });
}

export async function createPensionVerificationRequest(
  authboundClient: AuthboundClient,
  options: {
    policyId: string;
  }
) {
  return authboundClient.verifications.create({
    policyId: options.policyId,
    provider: "eudi",
  });
}

export async function getPensionVerificationStatus(
  authboundClient: AuthboundClient,
  options: {
    verificationId: string;
    clientToken: string;
    publishableKey: string;
  }
) {
  return authboundClient.verifications.getStatus(options.verificationId, {
    clientToken: options.clientToken,
    publishableKey: options.publishableKey,
  });
}

export async function getPensionVerificationResult(
  authboundClient: AuthboundClient,
  options: {
    verificationId: string;
  }
) {
  return authboundClient.verifications.getResult(options.verificationId);
}
